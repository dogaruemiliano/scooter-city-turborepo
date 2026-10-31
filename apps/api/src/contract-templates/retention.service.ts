import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client";
import { ContractSupport, canonical, digest, json } from "./contract-support";
import { packageSnapshotSchema } from "./contract-data";

type Category = v1.contracts.RetentionCategory;
type Manifest = z.infer<typeof v1.contracts.retentionManifestSchema>;
type Candidate = Manifest["items"][number];
const packageInclude = {
  rental: true,
  documents: { include: { signatures: true } },
} satisfies Prisma.DocumentPackageInclude;
type Package = Prisma.DocumentPackageGetPayload<{
  include: typeof packageInclude;
}>;
const referencesSchema = z.object({
  identityPhotos: z
    .array(z.object({ assetId: z.string(), sha256: z.string() }))
    .default([]),
  rentalMedia: z
    .array(z.object({ assetId: z.string(), sha256: z.string() }))
    .default([]),
  vehicleDocuments: z
    .array(z.object({ assetId: z.string(), sha256: z.string() }))
    .default([]),
});
const allCategories = v1.contracts.retentionCategorySchema.options;
/** Serialize new contractual references, legal holds and deletion claims for one company. */
export async function lockContractRetentionCompany(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "FinanceLegalIdentity" WHERE id = ${companyId} FOR UPDATE`;
}

/** Privileged deletion is a reviewed state machine, never an ordinary document-delete fallback. */
@Injectable()
export class ContractRetentionService {
  constructor(readonly support: ContractSupport) {}

  private async companyLock(tx: Prisma.TransactionClient, companyId: string) {
    await lockContractRetentionCompany(tx, companyId);
  }
  private async access(
    userId: string,
    purge = false,
    tx: Prisma.TransactionClient = this.support.prisma,
  ) {
    await this.support.require(
      userId,
      purge ? "evidence.retention.purge" : "evidence.retention.manage",
      tx,
    );
    return this.support.company(tx);
  }
  async list(userId: string) {
    const company = await this.access(userId);
    const [policies, holds, batches] = await Promise.all([
      this.support.prisma.contractRetentionPolicy.findMany({
        where: { companyId: company.id },
        orderBy: [{ category: "asc" }, { version: "desc" }],
      }),
      this.support.prisma.contractLegalHold.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
      }),
      this.support.prisma.contractRetentionBatch.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          status: true,
          manifestHash: true,
          requestedBy: true,
          approvedBy: true,
          createdAt: true,
          completedAt: true,
        },
      }),
    ]);
    await this.support.event(
      this.support.prisma,
      userId,
      company.id,
      "retention.read",
    );
    return { policies, holds, batches };
  }
  async createPolicy(
    userId: string,
    input: z.infer<typeof v1.contracts.retentionPolicyInputSchema>,
  ) {
    return this.support.prisma.$transaction(async (tx) => {
      const company = await this.access(userId, false, tx);
      await this.companyLock(tx, company.id);
      const previous = await tx.contractRetentionPolicy.findFirst({
        where: { companyId: company.id, category: input.category },
        orderBy: { version: "desc" },
      });
      const policy = await tx.contractRetentionPolicy.create({
        data: {
          ...input,
          companyId: company.id,
          version: (previous?.version ?? 0) + 1,
          createdBy: userId,
        },
      });
      await this.support.event(
        tx,
        userId,
        policy.id,
        "retention.policy_drafted",
        {
          category: policy.category,
          version: policy.version,
          daysAfterRentalClosed: policy.daysAfterRentalClosed,
        },
      );
      return policy;
    });
  }
  async approvePolicy(userId: string, id: string, statement: string) {
    return this.support.prisma.$transaction(async (tx) => {
      const company = await this.access(userId, true, tx);
      await this.companyLock(tx, company.id);
      const policy = await tx.contractRetentionPolicy.findFirst({
        where: { id, companyId: company.id },
      });
      if (!policy) throw new NotFoundException("Retention policy not found");
      if (
        await tx.contractRetentionItem.findFirst({
          where: {
            batch: { companyId: company.id },
            status: { in: ["deleting", "retry"] },
          },
          select: { id: true },
        })
      )
        throw new ConflictException(
          "Resolve in-flight deletion accounting before changing the applicable retention policy",
        );
      if (policy.createdBy === userId)
        throw new ForbiddenException(
          "A different authorized person must approve the retention policy",
        );
      if (policy.status === "approved") return policy;
      const result = await tx.contractRetentionPolicy.update({
        where: { id },
        data: {
          status: "approved",
          approvedBy: userId,
          approvedAt: new Date(),
          approvalStatement: statement,
        },
      });
      await this.support.event(tx, userId, id, "retention.policy_approved", {
        category: policy.category,
        version: policy.version,
      });
      return result;
    });
  }
  private assetReference(assetId: string): Prisma.DocumentPackageWhereInput {
    return {
      OR: [
        { selfieAssetId: assetId },
        { snapshot: { path: ["logoAssetId"], equals: assetId } },
        {
          documents: {
            some: {
              OR: [
                { presentedAssetId: assetId },
                { signedAssetId: assetId },
                { signatures: { some: { assetId } } },
              ],
            },
          },
        },
        ...["identityPhotos", "rentalMedia", "vehicleDocuments"].map((key) => ({
          snapshot: { path: [key], array_contains: [{ assetId }] },
        })),
      ],
    };
  }
  async hold(
    userId: string,
    input: z.infer<typeof v1.contracts.retentionHoldInputSchema>,
  ) {
    return this.support.prisma.$transaction(async (tx) => {
      const company = await this.access(userId, false, tx);
      await this.companyLock(tx, company.id);
      if (
        input.packageId &&
        !(await tx.documentPackage.findFirst({
          where: { id: input.packageId, companyId: company.id },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Package not found");
      if (
        input.assetId &&
        !(await tx.documentPackage.findFirst({
          where: {
            companyId: company.id,
            AND: [this.assetReference(input.assetId)],
          },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Retained asset not found");
      if (
        input.assetId &&
        (
          await tx.mediaAsset.findUnique({
            where: { id: input.assetId },
            select: { retentionPurgedAt: true },
          })
        )?.retentionPurgedAt
      )
        throw new ConflictException(
          "This object's bytes were already lawfully purged; a hold cannot restore them",
        );
      const inFlight = await tx.contractRetentionItem.findFirst({
        where: {
          batch: { companyId: company.id },
          status: { in: ["deleting", "retry"] },
          ...(input.category ? { category: input.category } : {}),
          ...(input.assetId
            ? { subjectType: "asset", targetId: input.assetId }
            : {}),
          ...(input.packageId ? { packageIds: { has: input.packageId } } : {}),
        },
        select: { id: true },
      });
      if (inFlight)
        throw new ConflictException(
          "A purge has an in-flight or uncertain outcome. Resolve its durable deletion accounting before claiming a hold protects those bytes.",
        );
      const result = await tx.contractLegalHold.create({
        data: { ...input, companyId: company.id, createdBy: userId },
      });
      await this.support.event(
        tx,
        userId,
        result.id,
        "retention.hold_created",
        {
          packageId: input.packageId ?? null,
          assetId: input.assetId ?? null,
          category: input.category ?? null,
        },
      );
      return result;
    });
  }
  async releaseHold(userId: string, id: string, reason: string) {
    return this.support.prisma.$transaction(async (tx) => {
      const company = await this.access(userId, true, tx);
      await this.companyLock(tx, company.id);
      const hold = await tx.contractLegalHold.findFirst({
        where: { id, companyId: company.id },
      });
      if (!hold) throw new NotFoundException("Legal hold not found");
      if (hold.releasedAt) return hold;
      const result = await tx.contractLegalHold.update({
        where: { id },
        data: {
          releasedAt: new Date(),
          releasedBy: userId,
          releaseReason: reason,
        },
      });
      await this.support.event(tx, userId, id, "retention.hold_released");
      return result;
    });
  }
  private async held(
    tx: Prisma.TransactionClient,
    companyId: string,
    ids: string[],
    category: string,
    assetId?: string,
  ) {
    return Boolean(
      await tx.contractLegalHold.findFirst({
        where: {
          companyId,
          releasedAt: null,
          AND: [
            { OR: [{ category: null }, { category }] },
            {
              OR: [
                { packageId: null, assetId: null },
                { packageId: { in: ids } },
                ...(assetId ? [{ assetId }] : []),
              ],
            },
          ],
        },
        select: { id: true },
      }),
    );
  }
  private closedAt(pkg: Package): Date | null {
    return pkg.rental.status === "returned"
      ? pkg.rental.returnedAt
      : pkg.rental.status === "cancelled"
        ? pkg.rental.updatedAt
        : null;
  }
  private refs(pkg: Package) {
    const raw = pkg.snapshot;
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new ConflictException("Invalid retained snapshot");
    if (
      raw.schemaVersion === 1 &&
      !packageSnapshotSchema.safeParse(raw).success
    )
      throw new ConflictException(
        "Unknown snapshot version must be assessed manually",
      );
    if (
      raw.schemaVersion !== 1 &&
      raw.schemaVersion !== "retention-tombstone-v1"
    )
      throw new ConflictException(
        "Unknown snapshot version must be assessed manually",
      );
    return referencesSchema.parse(raw);
  }
  private componentHash(pkg: Package, category: Category): string {
    const raw = pkg.snapshot as Prisma.JsonObject;
    if (category === "contract")
      return digest(
        canonical({
          subjectHash: pkg.subjectHash,
          manifestHash: pkg.manifestHash,
          display: raw.display ?? null,
          personName: raw.personName ?? null,
          phone: raw.phone ?? null,
          email: raw.email ?? null,
          signatures: pkg.documents.flatMap((d) =>
            d.signatures.map((s) => ({
              id: s.id,
              signerId: s.signerId,
              acceptanceText: s.acceptanceText,
              contentHash: s.contentHash,
              createdAt: s.createdAt.toISOString(),
            })),
          ),
        }),
      );
    if (category === "identity")
      return digest(
        canonical({
          identityPhotos: raw.identityPhotos ?? [],
          identityDocumentId: pkg.identityDocumentId,
          reviewReason: pkg.identityReviewReason,
        }),
      );
    if (category === "media") return digest(canonical(raw.rentalMedia ?? []));
    return digest(canonical({ selfieAssetId: pkg.selfieAssetId, category }));
  }
  private async liveAsset(
    tx: Prisma.TransactionClient,
    assetId: string,
    batchPackageIds: string[],
  ): Promise<boolean> {
    const asset = await tx.mediaAsset.findUnique({
      where: { id: assetId },
      select: {
        avatarUser: { select: { id: true } },
        contractSources: { take: 1, select: { id: true } },
        contractPreviews: { take: 1, select: { id: true } },
        documentPhotos: {
          where: { deletedAt: null, personDocument: { deletedAt: null } },
          take: 1,
          select: { id: true },
        },
        scooterDocuments: {
          where: { deletedAt: null },
          take: 1,
          select: { id: true },
        },
        scooterClientCopies: {
          where: { deletedAt: null },
          take: 1,
          select: { id: true },
        },
        problemPhotos: { take: 1, select: { id: true } },
        scooterPhotos: {
          where: {
            deletedAt: null,
            OR: [
              { rentalId: null },
              { rental: { status: { in: ["active", "reserved"] } } },
            ],
          },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!asset) return true;
    if (
      asset.avatarUser ||
      asset.contractSources.length ||
      asset.contractPreviews.length ||
      asset.documentPhotos.length ||
      asset.scooterDocuments.length ||
      asset.scooterClientCopies.length ||
      asset.problemPhotos.length ||
      asset.scooterPhotos.length
    )
      return true;
    if (
      await tx.contractSettings.findFirst({
        where: { data: { path: ["logoAssetId"], equals: assetId } },
        select: { companyId: true },
      })
    )
      return true;
    return Boolean(
      await tx.documentPackage.findFirst({
        where: {
          id: { notIn: batchPackageIds },
          AND: [this.assetReference(assetId)],
        },
        select: { id: true },
      }),
    );
  }

  /** Preview is read-only for source data and objects; its exact digest is what a second person approves. */
  async preview(
    userId: string,
    input: z.infer<typeof v1.contracts.retentionPreviewInputSchema>,
  ) {
    return this.support.prisma.$transaction(
      async (tx) => {
        const company = await this.access(userId, false, tx);
        await this.companyLock(tx, company.id);
        const packages = await tx.documentPackage.findMany({
          where: { id: { in: input.packageIds }, companyId: company.id },
          include: packageInclude,
        });
        if (packages.length !== input.packageIds.length)
          throw new NotFoundException(
            "One or more packages are not authorized",
          );
        const manifest: Manifest = {
          schemaVersion: 1,
          companyId: company.id,
          packageIds: input.packageIds,
          categories: input.categories,
          createdAt: new Date().toISOString(),
          policyVersions: [],
          items: [],
          blockers: [],
        };
        const assets = new Map<string, Candidate>();
        for (const category of input.categories) {
          const policy = await tx.contractRetentionPolicy.findFirst({
            where: { companyId: company.id, category, status: "approved" },
            orderBy: { version: "desc" },
          });
          if (!policy) {
            manifest.blockers.push(`policy.${category}.approval_required`);
            continue;
          }
          manifest.policyVersions.push({
            id: policy.id,
            category,
            version: policy.version,
            daysAfterRentalClosed: policy.daysAfterRentalClosed,
          });
          for (const pkg of packages) {
            const closed = this.closedAt(pkg);
            if (!closed) {
              manifest.blockers.push(`package.${pkg.id}.rental_not_closed`);
              continue;
            }
            if (
              category !== "audit" &&
              pkg.retentionPurgedCategories.includes(category)
            )
              continue;
            const eligibleAt = v1.rentals.addRentalCalendar(
              closed,
              policy.daysAfterRentalClosed,
            );
            const blockers =
              eligibleAt > new Date() ? ["retention_period_not_elapsed"] : [];
            if (await this.held(tx, company.id, [pkg.id], category))
              blockers.push("legal_hold");
            const refs = this.refs(pkg);
            if (category !== "audit")
              manifest.items.push({
                category,
                subjectType: "package",
                targetId: pkg.id,
                packageIds: [pkg.id],
                policyId: policy.id,
                expectedHash: this.componentHash(pkg, category),
                eligibleAt: eligibleAt.toISOString(),
                byteSize: 0,
                blockers: [...blockers],
              });
            let ids: string[] = [];
            if (category === "contract")
              ids = pkg.documents.flatMap((d) => [
                d.presentedAssetId,
                ...(d.signedAssetId ? [d.signedAssetId] : []),
                ...d.signatures.map((s) => s.assetId),
              ]);
            if (category === "selfie" && pkg.selfieAssetId)
              ids = [pkg.selfieAssetId];
            if (category === "identity")
              ids = refs.identityPhotos.map((p) => p.assetId);
            if (category === "media")
              ids = refs.rentalMedia.map((p) => p.assetId);
            for (const assetId of new Set(ids)) {
              const asset = await tx.mediaAsset.findUnique({
                where: { id: assetId },
              });
              if (!asset) {
                manifest.blockers.push(`asset.${assetId}.missing_metadata`);
                continue;
              }
              if (asset.retentionPurgedAt) continue;
              const previous = assets.get(assetId);
              if (previous && previous.category !== category) {
                manifest.blockers.push(`asset.${assetId}.ambiguous_category`);
                continue;
              }
              const item = previous ?? {
                category,
                subjectType: "asset" as const,
                targetId: assetId,
                packageIds: [],
                policyId: policy.id,
                expectedHash: asset.checksumSha256,
                eligibleAt: eligibleAt.toISOString(),
                byteSize: asset.byteSize,
                blockers: [],
              };
              item.packageIds = [...new Set([...item.packageIds, pkg.id])];
              if (new Date(item.eligibleAt) < eligibleAt)
                item.eligibleAt = eligibleAt.toISOString();
              item.blockers.push(...blockers);
              if (asset.deletedAt && !asset.retentionPurgeItemId)
                item.blockers.push("asset_unavailable");
              if (await this.held(tx, company.id, [pkg.id], category, assetId))
                item.blockers.push("legal_hold");
              assets.set(assetId, item);
            }
            if (category === "audit") {
              const targets = [
                pkg.id,
                pkg.rentalId,
                ...pkg.documents.map((d) => d.id),
              ];
              const events = await tx.auditEvent.findMany({
                where: {
                  retentionPurgedAt: null,
                  targetId: { in: targets },
                  targetType: { in: ["ContractWorkflow", "Rental"] },
                },
                take: 501,
              });
              if (events.length > 500)
                throw new ConflictException(
                  "Use a smaller retention assessment; the audit scan is bounded",
                );
              for (const event of events) {
                const due = v1.rentals.addRentalCalendar(
                  event.createdAt > closed ? event.createdAt : closed,
                  policy.daysAfterRentalClosed,
                );
                manifest.items.push({
                  category,
                  subjectType: "audit",
                  targetId: event.id,
                  packageIds: [pkg.id],
                  policyId: policy.id,
                  expectedHash: digest(canonical(json(event))),
                  eligibleAt: due.toISOString(),
                  byteSize: 0,
                  blockers: [
                    ...blockers,
                    ...(due > new Date()
                      ? ["retention_period_not_elapsed"]
                      : []),
                  ],
                });
              }
            }
          }
        }
        for (const item of assets.values()) {
          if (await this.liveAsset(tx, item.targetId, input.packageIds))
            item.blockers.push("referenced_live_or_outside_batch");
          manifest.items.push(item);
        }
        if (manifest.items.length > 500)
          throw new ConflictException(
            "Use a smaller retention assessment; the item budget is 500",
          );
        manifest.items = [
          ...new Map(
            manifest.items.map((item) => [
              `${item.category}:${item.subjectType}:${item.targetId}`,
              { ...item, blockers: [...new Set(item.blockers)] },
            ]),
          ).values(),
        ];
        const parsed = v1.contracts.retentionManifestSchema.parse(manifest),
          manifestHash = digest(canonical(parsed));
        const batch = await tx.contractRetentionBatch.create({
          data: {
            companyId: company.id,
            packageIds: input.packageIds,
            categories: input.categories,
            manifest: json(parsed),
            manifestHash,
            requestedBy: userId,
            expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
          },
        });
        await this.support.event(
          tx,
          userId,
          batch.id,
          "retention.preview_created",
          {
            manifestHash,
            packages: input.packageIds,
            categories: input.categories,
            items: parsed.items.length,
          },
        );
        return {
          id: batch.id,
          status: batch.status,
          manifestHash,
          manifest: parsed,
          expiresAt: batch.expiresAt,
        };
      },
      { timeout: 30_000 },
    );
  }

  async get(userId: string, id: string) {
    const company = await this.access(userId);
    const batch = await this.support.prisma.contractRetentionBatch.findFirst({
      where: { id, companyId: company.id },
      include: { items: true },
    });
    if (!batch) throw new NotFoundException("Retention batch not found");
    await this.support.event(
      this.support.prisma,
      userId,
      id,
      "retention.batch_read",
    );
    return {
      ...batch,
      manifest: v1.contracts.retentionManifestSchema.parse(batch.manifest),
    };
  }
  async approve(
    userId: string,
    id: string,
    input: z.infer<typeof v1.contracts.retentionApprovalInputSchema>,
  ) {
    await this.support.prisma.$transaction(async (tx) => {
      const company = await this.access(userId, true, tx);
      await this.companyLock(tx, company.id);
      const batch = await tx.contractRetentionBatch.findFirst({
        where: { id, companyId: company.id },
      });
      if (
        !batch ||
        batch.manifestHash !== input.manifestHash ||
        batch.expiresAt <= new Date()
      )
        throw new ConflictException(
          "Retention preview is missing, expired or changed",
        );
      if (batch.requestedBy === userId)
        throw new ForbiddenException(
          "A different authorized person must approve the exact purge manifest",
        );
      if (batch.status !== "preview") {
        if (batch.approvedBy === userId) return;
        throw new ConflictException("Batch is already approved");
      }
      const manifest = v1.contracts.retentionManifestSchema.parse(
        batch.manifest,
      );
      if (
        !manifest.items.length ||
        manifest.blockers.length ||
        manifest.items.some((item) => item.blockers.length)
      )
        throw new ConflictException(
          "Resolve every preview blocker and create a new preview before approving deletion",
        );
      if (digest(canonical(manifest)) !== batch.manifestHash)
        throw new ConflictException("Retention manifest integrity failed");
      await tx.contractRetentionItem.createMany({
        data: manifest.items.map((item) => ({
          batchId: id,
          category: item.category,
          subjectType: item.subjectType,
          targetId: item.targetId,
          packageIds: item.packageIds,
          policyId: item.policyId,
          expectedHash: item.expectedHash,
          eligibleAt: new Date(item.eligibleAt),
        })),
      });
      await tx.contractRetentionBatch.update({
        where: { id },
        data: {
          status: "approved",
          approvedBy: userId,
          approvedAt: new Date(),
          approvalStatement: input.statement,
        },
      });
      await this.support.event(tx, userId, id, "retention.batch_approved", {
        manifestHash: batch.manifestHash,
      });
    });
    return this.get(userId, id);
  }

  /** Revalidate every subject immediately before a durable deletion fence is acquired. */
  private async validateItem(
    tx: Prisma.TransactionClient,
    batch: Prisma.ContractRetentionBatchGetPayload<object>,
    item: Prisma.ContractRetentionItemGetPayload<object>,
  ) {
    if (
      !batch.approvedBy ||
      batch.approvedBy === batch.requestedBy ||
      (batch.expiresAt <= new Date() &&
        !(await tx.contractRetentionItem.count({
          where: { batchId: batch.id, attempts: { gt: 0 } },
        })))
    )
      throw new ConflictException(
        "A fresh independently approved preview is required",
      );
    const policy = await tx.contractRetentionPolicy.findUniqueOrThrow({
      where: { id: item.policyId },
    });
    const current = await tx.contractRetentionPolicy.findFirst({
      where: {
        companyId: batch.companyId,
        category: item.category,
        status: "approved",
      },
      orderBy: { version: "desc" },
    });
    if (
      current?.id !== policy.id ||
      policy.status !== "approved" ||
      item.eligibleAt > new Date()
    )
      throw new ConflictException(
        "Retention policy changed or its period has not elapsed",
      );
    const packages = await tx.documentPackage.findMany({
      where: { id: { in: item.packageIds }, companyId: batch.companyId },
      include: packageInclude,
    });
    if (
      packages.length !== item.packageIds.length ||
      packages.some((pkg) => !this.closedAt(pkg))
    )
      throw new ConflictException("A referenced rental is live or unavailable");
    for (const pkg of packages) {
      const closed = this.closedAt(pkg)!;
      if (
        v1.rentals.addRentalCalendar(closed, policy.daysAfterRentalClosed) >
        new Date()
      )
        throw new ConflictException("Retention clock changed");
    }
    if (
      await this.held(
        tx,
        batch.companyId,
        item.packageIds,
        item.category,
        item.subjectType === "asset" ? item.targetId : undefined,
      )
    )
      throw new ConflictException("A legal hold prevents this purge");
    if (item.subjectType === "asset") {
      const asset = await tx.mediaAsset.findUniqueOrThrow({
        where: { id: item.targetId },
      });
      if (
        asset.checksumSha256 !== item.expectedHash ||
        (asset.retentionPurgeItemId &&
          asset.retentionPurgeItemId !== item.id &&
          !asset.retentionPurgedAt)
      )
        throw new ConflictException(
          "Asset changed or belongs to another purge",
        );
      if (
        !asset.retentionPurgedAt &&
        (await this.liveAsset(tx, asset.id, batch.packageIds))
      )
        throw new ConflictException(
          "A live or outside-batch reference protects this file",
        );
    } else if (item.subjectType === "package") {
      if (
        this.componentHash(
          packages[0],
          v1.contracts.retentionCategorySchema.parse(item.category),
        ) !== item.expectedHash
      )
        throw new ConflictException(
          "Retained metadata changed; create a new preview",
        );
      if (
        await tx.contractRetentionItem.count({
          where: {
            batchId: batch.id,
            category: item.category,
            subjectType: "asset",
            packageIds: { has: item.targetId },
            status: { not: "purged" },
          },
        })
      )
        throw new ConflictException(
          "Finish durable file deletion before redacting its metadata",
        );
    } else {
      const event = await tx.auditEvent.findUniqueOrThrow({
        where: { id: item.targetId },
      });
      if (
        !event.retentionPurgedAt &&
        digest(canonical(json(event))) !== item.expectedHash
      )
        throw new ConflictException(
          "Audit evidence changed; create a new preview",
        );
    }
  }

  async execute(userId: string, id: string, manifestHash: string) {
    const before = await this.get(userId, id);
    await this.access(userId, true);
    if (
      before.manifestHash !== manifestHash ||
      !before.approvedBy ||
      !["approved", "partial", "running", "completed"].includes(before.status)
    )
      throw new ConflictException("Approve the exact preview before execution");
    if (before.status === "completed") return before;
    const ordered = [...before.items].sort(
      (a, b) =>
        (a.subjectType === "asset"
          ? 0
          : a.subjectType === "audit"
            ? 1
            : a.category === "contract"
              ? 3
              : 2) -
        (b.subjectType === "asset"
          ? 0
          : b.subjectType === "audit"
            ? 1
            : b.category === "contract"
              ? 3
              : 2),
    );
    for (const item of ordered) {
      if (item.status === "purged") continue;
      const leaseToken = randomUUID();
      let fenced = false;
      try {
        const claimed = await this.support.prisma.$transaction(async (tx) => {
          const company = await this.access(userId, true, tx);
          await this.companyLock(tx, company.id);
          const batch = await tx.contractRetentionBatch.findFirstOrThrow({
            where: { id, companyId: company.id },
          });
          const current = await tx.contractRetentionItem.findUniqueOrThrow({
            where: { id: item.id },
          });
          if (current.status === "purged") return null;
          if (
            current.status === "deleting" &&
            current.leaseUntil &&
            current.leaseUntil > new Date()
          )
            throw new ConflictException("A deletion worker owns this item");
          await this.validateItem(tx, batch, current);
          if (current.subjectType === "asset") {
            await tx.mediaAsset.update({
              where: { id: current.targetId },
              data: { deletedAt: new Date(), retentionPurgeItemId: current.id },
            });
          }
          await tx.contractRetentionBatch.update({
            where: { id },
            data: { status: "running" },
          });
          await tx.contractRetentionItem.update({
            where: { id: current.id },
            data: {
              status: "deleting",
              attempts: { increment: 1 },
              leaseUntil: new Date(Date.now() + 5 * 60_000),
              leaseToken,
              error: null,
            },
          });
          await this.support.event(tx, userId, id, "retention.subject_fenced", {
            itemId: current.id,
            category: current.category,
            subjectType: current.subjectType,
            targetId: current.targetId,
            expectedHash: current.expectedHash,
          });
          return current;
        });
        if (!claimed) continue;
        fenced = true;
        // External deletion is idempotent and outside a database transaction. A failed
        // metadata commit leaves the fence intact; retry re-deletes surviving versions.
        if (claimed.subjectType === "asset") {
          const asset = await this.support.prisma.mediaAsset.findUniqueOrThrow({
            where: { id: claimed.targetId },
          });
          if (!asset.retentionPurgedAt)
            await this.support.storage.purgeRetainedDocument(asset);
          await this.support.prisma.contractRetentionItem.updateMany({
            where: { id: claimed.id, leaseToken, status: "deleting" },
            data: { providerDeletedAt: new Date() },
          });
        }
        await this.support.prisma.$transaction(async (tx) => {
          await this.companyLock(tx, before.companyId);
          const current = await tx.contractRetentionItem.findUniqueOrThrow({
            where: { id: claimed.id },
          });
          if (current.status === "purged") return;
          if (
            current.leaseToken !== leaseToken ||
            current.status !== "deleting"
          )
            throw new ConflictException(
              "Deletion lease changed; retry durable accounting",
            );
          if (current.subjectType === "asset") {
            await tx.mediaAsset.update({
              where: { id: current.targetId },
              data: { retentionPurgedAt: new Date(), deletedAt: new Date() },
            });
            if (current.category === "media")
              await tx.scooterPhoto.updateMany({
                where: { assetId: current.targetId },
                data: {
                  deletedAt: new Date(),
                  fileName: "retention-purged",
                  caption: null,
                },
              });
            if (current.category === "identity")
              await tx.personDocumentPhoto.updateMany({
                where: { assetId: current.targetId },
                data: { deletedAt: new Date() },
              });
          }
          if (current.subjectType === "audit")
            await tx.auditEvent.update({
              where: { id: current.targetId },
              data: {
                userId: null,
                ip: null,
                userAgent: null,
                meta: {
                  retentionBatchId: id,
                  originalSha256: current.expectedHash,
                },
                retentionOriginalHash: current.expectedHash,
                retentionPurgedAt: new Date(),
              },
            });
          if (current.subjectType === "package")
            await this.redactPackage(
              tx,
              current.targetId,
              v1.contracts.retentionCategorySchema.parse(current.category),
              id,
              current.expectedHash,
            );
          await tx.contractRetentionItem.update({
            where: { id: current.id },
            data: {
              status: "purged",
              purgedAt: new Date(),
              leaseUntil: null,
              leaseToken: null,
              error: null,
            },
          });
          await this.support.event(tx, userId, id, "retention.subject_purged", {
            itemId: current.id,
            targetId: current.targetId,
            originalSha256: current.expectedHash,
          });
        });
      } catch (error: unknown) {
        await this.support.prisma.contractRetentionItem.updateMany({
          where: {
            id: item.id,
            ...(fenced
              ? { leaseToken, status: "deleting" }
              : { status: { in: ["pending", "blocked"] } }),
          },
          data: {
            status: fenced ? "retry" : "blocked",
            leaseUntil: null,
            error:
              error instanceof Error
                ? error.message.slice(0, 1000)
                : "Purge requires recovery",
          },
        });
      }
    }
    const unfinished = await this.support.prisma.contractRetentionItem.count({
      where: { batchId: id, status: { not: "purged" } },
    });
    await this.support.prisma.contractRetentionBatch.update({
      where: { id },
      data: {
        status: unfinished ? "partial" : "completed",
        completedAt: unfinished ? null : new Date(),
      },
    });
    if (!unfinished && before.categories.includes("audit")) {
      await this.support.prisma.$transaction(async (tx) => {
        await this.companyLock(tx, before.companyId);
        for (const packageId of before.packageIds) {
          const pkg = await tx.documentPackage.findUniqueOrThrow({
            where: { id: packageId },
          });
          const categories = [
            ...new Set([...pkg.retentionPurgedCategories, "audit"]),
          ];
          await tx.documentPackage.update({
            where: { id: packageId },
            data: {
              retentionPurgedCategories: categories,
              retentionState: allCategories.every((c) => categories.includes(c))
                ? "purged"
                : "partially_purged",
            },
          });
        }
      });
    }
    await this.support.event(
      this.support.prisma,
      userId,
      id,
      "retention.execution_accounted",
      { manifestHash, unfinished },
    );
    return this.get(userId, id);
  }

  private async redactPackage(
    tx: Prisma.TransactionClient,
    id: string,
    category: Category,
    batchId: string,
    originalHash: string,
  ) {
    const pkg = await tx.documentPackage.findUniqueOrThrow({
      where: { id },
      include: packageInclude,
    });
    const snapshot = json(pkg.snapshot) as Prisma.InputJsonObject;
    let next: Prisma.InputJsonValue = snapshot;
    if (category === "identity") next = { ...snapshot, identityPhotos: [] };
    if (category === "media") next = { ...snapshot, rentalMedia: [] };
    if (category === "contract") {
      const refs = this.refs(pkg);
      next = {
        schemaVersion: "retention-tombstone-v1",
        retentionBatchId: batchId,
        originalSubjectHash: pkg.subjectHash,
        originalManifestHash: pkg.manifestHash,
        originalMetadataHash: originalHash,
        identityPhotos: refs.identityPhotos,
        rentalMedia: refs.rentalMedia,
        vehicleDocuments: [],
      };
      for (const document of pkg.documents)
        await tx.documentSignature.updateMany({
          where: { documentId: document.id },
          data: {
            signerId: "retention-purged",
            acceptanceText:
              "Retention purge: original evidence digest retained in the approved purge manifest",
          },
        });
      await tx.rentalSigningSession.updateMany({
        where: { packageId: id },
        data: {
          phone: "retention-purged",
          revokedAt: new Date(),
          otpHash: null,
          otpPurpose: null,
          otpExpiresAt: null,
        },
      });
      await tx.signingInvitation.updateMany({
        where: { packageId: id },
        data: { revokedAt: new Date() },
      });
    }
    const categories = [
      ...new Set([...pkg.retentionPurgedCategories, category]),
    ];
    await tx.documentPackage.update({
      where: { id },
      data: {
        snapshot: next,
        retentionPurgedCategories: categories,
        retentionRedactedAt: new Date(),
        retentionState: allCategories.every((c) => categories.includes(c))
          ? "purged"
          : "partially_purged",
        ...(category === "contract"
          ? { status: "retention_purged", identityReviewReason: null }
          : category === "identity"
            ? { identityReviewReason: null }
            : {}),
      },
    });
  }
}
