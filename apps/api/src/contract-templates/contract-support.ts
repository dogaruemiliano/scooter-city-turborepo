import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { v1 } from "@repo/api-shared";
import { PrismaService } from "../prisma/prisma.service";
import { AccessService } from "../access/access.service";
import { ImageStorageService } from "../image-storage/image-storage.service";
import type { Prisma } from "../generated/prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuditEventType } from "../audit/audit.types";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const digest = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");
export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
/** Stable ordering makes the manifest independent of object insertion order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

@Injectable()
export class ContractSupport {
  constructor(
    readonly prisma: PrismaService,
    readonly access: AccessService,
    readonly storage: ImageStorageService,
    readonly audit: AuditService,
  ) {}
  async require(
    userId: string,
    permission: v1.access.PermissionKey,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const access = await this.access.getSnapshot(userId, tx);
    if (
      !access.isSuperAdmin &&
      !access.effectiveScopes[permission]?.includes("ALL")
    )
      throw new ForbiddenException("Permission required");
    return access;
  }
  async company(tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const company = await tx.financeLegalIdentity.findFirst({
      where: { book: { type: "COMPANY" } },
    });
    if (!company)
      throw new ConflictException("Configure the company legal identity first");
    return company;
  }
  async event(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string | null,
    targetId: string,
    action: string,
    meta: Prisma.InputJsonValue = {},
  ) {
    await this.audit.recordRequired(tx, {
      type: AuditEventType.CONTRACT_PACKAGE_CHANGED,
      userId,
      targetType: "ContractWorkflow",
      targetId,
      meta: { action, data: meta },
    });
  }
  /** Every object has a fresh server key. No ordinary operation overwrites or deletes contract assets. */
  async store(buffer: Buffer, contentType: string, userId?: string) {
    const stored = await this.storage.storeDocument({
      buffer,
      byteSize: buffer.length,
      contentType,
      category: "contract-document",
    });
    return this.prisma.mediaAsset.create({
      data: {
        ...stored,
        imageWidth: undefined,
        imageHeight: undefined,
        pageCount: undefined,
        uploadedByUserId: userId,
      } as Prisma.MediaAssetUncheckedCreateInput,
    });
  }
  async read(asset: {
    storageKey: string;
    checksumSha256: string;
    byteSize: number;
    deletedAt?: Date | null;
  }) {
    if (asset.deletedAt) throw new NotFoundException("Document unavailable");
    const stored = await this.storage.readDocument(asset.storageKey);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stored.body) {
      const bytes = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > asset.byteSize || size > 25 * 1024 * 1024) {
        stored.body.destroy();
        throw new ConflictException("Stored file size differs from manifest");
      }
      chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks);
    if (size !== asset.byteSize || digest(bytes) !== asset.checksumSha256)
      throw new ConflictException("Stored file failed integrity verification");
    return bytes;
  }
  async command(
    tx: Prisma.TransactionClient,
    key: string,
    action: string,
    targetId: string,
    input: unknown,
    run: () => Promise<string>,
  ) {
    const fingerprint = digest(canonical(input));
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`contract:${key}`}, 0))::text AS locked`;
    const previous = await tx.contractCommand.findUnique({ where: { key } });
    if (previous) {
      if (
        previous.action !== action ||
        previous.targetId !== targetId ||
        previous.fingerprint !== fingerprint
      )
        throw new ConflictException(
          "Idempotency key reused for a different operation",
        );
      return previous.resultId;
    }
    const resultId = await run();
    await tx.contractCommand.create({
      data: { key, action, targetId, fingerprint, resultId },
    });
    return resultId;
  }
}
