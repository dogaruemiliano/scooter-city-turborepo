import {
  documentAcceptanceText,
  freezePackageAcceptances,
  limiterAcceptanceText,
} from "./signing-acceptance";
import { writeDocxZip } from "./engine/zip";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import type { Prisma } from "../generated/prisma/client";
import { ContractSupport, canonical, digest, json } from "./contract-support";
import {
  buildPackageSnapshot,
  packageSnapshotSchema,
  snapshotValues,
} from "./contract-data";
import {
  assertPackageCurrent,
  packageSourceFingerprint,
} from "./package-integrity";
import {
  renderDocxTemplate,
  validateDocxTemplate,
  RENDERER_VERSION,
  REGISTRY_VERSION,
  type ContractTemplateType,
  type TemplateValue,
} from "./engine/docx-engine";
import { convertDocxToPdf } from "./engine/pdf-converter";

export const packageInclude = {
  documents: {
    include: { signatures: true },
    orderBy: { type: "asc" as const },
  },
} satisfies Prisma.DocumentPackageInclude;
export function packageDto(
  row: Prisma.DocumentPackageGetPayload<{ include: typeof packageInclude }>,
) {
  const snapshot = packageSnapshotSchema.safeParse(row.snapshot);
  const order = [
    "RENTAL_AGREEMENT",
    "GDPR_NOTICE",
    "TECHNICAL_HANDOVER",
    "PROMOTION_ADDENDUM",
  ];
  return v1.contracts.documentPackageSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...row,
        identityPhotos: snapshot.success ? snapshot.data.identityPhotos : [],
        documents: [...row.documents]
          .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
          .map((d) => ({
            ...d,
            acceptanceText: snapshot.success
              ? documentAcceptanceText(snapshot.data, d.type)
              : undefined,
            limiterAcceptanceText:
              snapshot.success && d.requiresLimiterSignature
                ? limiterAcceptanceText(snapshot.data)
                : null,
            signedAt:
              d.signatures.find((s) => s.role === "customer")?.createdAt ??
              null,
            companySignedAt:
              d.signatures.find((s) => s.role === "company")?.createdAt ?? null,
            limiterSignedAt:
              d.signatures.find((s) => s.role === "limiter")?.createdAt ?? null,
          })),
      }),
    ),
  );
}

@Injectable()
export class PackagesService {
  constructor(
    readonly support: ContractSupport,
    @Inject(ENV) readonly env: Env,
  ) {}
  async get(
    userId: string,
    id: string,
    permission: v1.access.PermissionKey = "documents.read",
  ) {
    await this.support.require(userId, permission);
    const company = await this.support.company();
    const row = await this.support.prisma.documentPackage.findFirst({
      where: { id, companyId: company.id },
      include: packageInclude,
    });
    if (!row) throw new NotFoundException("Document package not found");
    return row;
  }
  async list(userId: string, rentalId: string) {
    await this.support.require(userId, "documents.read");
    const company = await this.support.company();
    const items = await this.support.prisma.documentPackage.findMany({
      where: { rentalId, companyId: company.id },
      include: packageInclude,
      orderBy: { revision: "desc" },
    });
    return { items: items.map(packageDto) };
  }
  async create(
    userId: string,
    rentalId: string,
    input: z.infer<typeof v1.contracts.createPackageInputSchema>,
  ) {
    if (!this.env.CONTRACT_WORKFLOW_ENABLED)
      throw new ServiceUnavailableException(
        "Contract issuance is disabled until the configured pilot is approved",
      );
    const id = await this.support.prisma.$transaction(async (tx) => {
      await this.support.require(userId, "documents.manage", tx);
      const company = await this.support.company(tx);
      return this.support.command(
        tx,
        input.idempotencyKey,
        "package.create",
        rentalId,
        input,
        async () => {
          const reference = await tx.rental.findUniqueOrThrow({
            where: { id: rentalId },
          });
          await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${reference.scooterId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "Rental" WHERE id = ${rentalId} FOR UPDATE`;
          // Pinning JSON asset references shares the retention claim mutex.
          await tx.$queryRaw`SELECT id FROM "FinanceLegalIdentity" WHERE id = ${company.id} FOR UPDATE`;
          const settings = await tx.contractSettings.findUnique({
            where: { companyId: company.id },
          });
          const previous = await tx.documentPackage.findFirst({
            where: { rentalId },
            orderBy: { revision: "desc" },
          });
          if (previous?.contractConcludedAt)
            throw new ConflictException(
              "A concluded agreement requires an addendum/correction procedure",
            );
          const setId =
            previous && !input.updateToActiveSet
              ? previous.templateSetVersionId
              : settings?.activeSetId;
          if (!setId)
            throw new ConflictException(
              "Activate a compatible template set first",
            );
          const set = await tx.templateSetVersion.findUniqueOrThrow({
            where: { id: setId },
            include: {
              agreementVersion: true,
              gdprVersion: true,
              technicalVersion: true,
              promotionVersion: true,
            },
          });
          if (set.companyId !== company.id)
            throw new ForbiddenException("Company mismatch");
          if (
            [set.agreementVersion, set.gdprVersion, set.technicalVersion].some(
              (v) => v.status !== "PUBLISHED",
            )
          )
            throw new ConflictException(
              "The selected set contains archived versions",
            );
          const sequence = await tx.$queryRaw<
            { value: bigint }[]
          >`SELECT nextval('"ContractNumberSequence"') AS value`;
          const built = await buildPackageSnapshot(
            tx,
            rentalId,
            company.id,
            `SC-${sequence[0].value.toString().padStart(6, "0")}`,
          );
          built.snapshot.finalOtpRequired = this.env.CONTRACT_FINAL_OTP_ENABLED;
          built.snapshot.acceptanceTexts = freezePackageAcceptances(
            built.snapshot,
          );
          if (
            built.snapshot.terms.promotion === "three_plus_one" &&
            (!set.promotionApproved ||
              !set.promotionVersion ||
              set.promotionVersion.status !== "PUBLISHED")
          )
            throw new ConflictException(
              "Publish an explicitly approved 3+1 clause/addendum before issuing a promotional package",
            );
          const fingerprint = await packageSourceFingerprint(
            tx,
            rentalId,
            built.snapshot.identityDocumentId,
          );
          if (previous) {
            await tx.documentPackage.update({
              where: { id: previous.id },
              data: { status: "superseded" },
            });
            await tx.rentalSigningSession.updateMany({
              where: { packageId: previous.id, revokedAt: null },
              data: { revokedAt: new Date() },
            });
            await tx.signingInvitation.updateMany({
              where: { packageId: previous.id, revokedAt: null },
              data: { revokedAt: new Date() },
            });
          }
          const pkg = await tx.documentPackage.create({
            data: {
              companyId: company.id,
              rentalId,
              revision: (previous?.revision ?? 0) + 1,
              rentalRevision: built.rentalRevision,
              inspectionId: built.inspectionId,
              templateSetVersionId: setId,
              snapshot: json(built.snapshot),
              sourceFingerprint: fingerprint,
              subjectHash: digest(canonical(built.snapshot)),
              identityDocumentId: built.snapshot.identityDocumentId,
              createdBy: userId,
            },
          });
          await this.support.event(tx, userId, pkg.id, "package.created", {
            revision: pkg.revision,
            templateSetVersionId: setId,
          });
          return pkg.id;
        },
      );
    });
    return packageDto(await this.get(userId, id));
  }
  async render(userId: string, id: string, key: string) {
    const pkg = await this.get(userId, id, "documents.manage");
    if (pkg.status === "rendered") return packageDto(pkg);
    if (!this.env.CONTRACT_RENDERER_BINARY)
      throw new ServiceUnavailableException(
        "Private DOCX converter not configured",
      );
    if (!["draft", "render_failed"].includes(pkg.status))
      throw new ConflictException("Only a draft package can be rendered");
    const leaseUntil = new Date(Date.now() + 5 * 60_000);
    const leased = await this.support.prisma.documentPackage.updateMany({
      where: {
        id,
        status: { in: ["draft", "render_failed"] },
        OR: [
          { renderLeaseUntil: null },
          { renderLeaseUntil: { lt: new Date() } },
        ],
      },
      data: { renderLeaseUntil: leaseUntil, error: null },
    });
    if (!leased.count)
      throw new ConflictException("Rendering is already running");
    try {
      const snapshot = packageSnapshotSchema.parse(pkg.snapshot);
      const set =
        await this.support.prisma.templateSetVersion.findUniqueOrThrow({
          where: { id: pkg.templateSetVersionId },
        });
      const versions = [
        set.agreementVersionId,
        set.gdprVersionId,
        set.technicalVersionId,
        ...(snapshot.terms.promotion === "three_plus_one" &&
        set.promotionVersionId
          ? [set.promotionVersionId]
          : []),
      ];
      const documents: Prisma.RentalDocumentUncheckedCreateInput[] = [];
      for (const versionId of versions) {
        const version =
          await this.support.prisma.contractTemplateVersion.findUniqueOrThrow({
            where: { id: versionId },
            include: { template: true, sourceAsset: true },
          });
        const values = {
          ...snapshotValues(
            snapshot,
            `${version.templateId}:${version.version}`,
          ),
        };
        if (snapshot.logoAssetId) {
          const logo = await this.support.prisma.mediaAsset.findUniqueOrThrow({
            where: { id: snapshot.logoAssetId },
          });
          if (!["image/png", "image/jpeg"].includes(logo.contentType))
            throw new ConflictException("Unsupported company logo");
          values.companyLogo = {
            kind: "image",
            bytes: await this.support.read(logo),
            mimeType: logo.contentType as "image/png" | "image/jpeg",
            alt: snapshot.companyName,
          };
        }
        const source = await this.support.read(version.sourceAsset);
        if (
          version.rendererVersion !== RENDERER_VERSION ||
          version.schemaVersion !== REGISTRY_VERSION ||
          validateDocxTemplate(
            source,
            version.template.type as ContractTemplateType,
          ).manifestHash !== version.manifestHash
        )
          throw new ConflictException(
            "Pinned template runtime changed; revalidate and publish a new version",
          );
        const rendered = renderDocxTemplate(
          source,
          version.template.type as ContractTemplateType,
          values,
        );
        const asset = await this.support.store(
          await convertDocxToPdf(rendered, this.env.CONTRACT_RENDERER_BINARY),
          "application/pdf",
          userId,
        );
        documents.push({
          id: randomUUID(),
          packageId: id,
          type: version.template.type,
          templateVersionId: version.id,
          contentHash: asset.checksumSha256,
          presentedAssetId: asset.id,
          requiresLimiterSignature:
            version.template.type === "TECHNICAL_HANDOVER" &&
            snapshot.limiterKind === "LIMITED",
        });
      }
      await this.support.prisma.$transaction(async (tx) =>
        this.support.command(
          tx,
          key,
          "package.render",
          id,
          { subjectHash: pkg.subjectHash },
          async () => {
            await assertPackageCurrent(tx, pkg);
            const current = await tx.documentPackage.findUniqueOrThrow({
              where: { id },
            });
            if (
              !["draft", "render_failed"].includes(current.status) ||
              current.renderLeaseUntil?.getTime() !== leaseUntil.getTime()
            )
              throw new ConflictException(
                "Package changed or rendering lease expired",
              );
            const manifest = {
              schemaVersion: 1,
              packageId: id,
              revision: pkg.revision,
              templateSetVersionId: pkg.templateSetVersionId,
              templateSetHash: set.manifestHash,
              snapshotHash: pkg.subjectHash,
              order: versions,
              documents: documents.map((d) => ({
                id: d.id,
                type: d.type,
                templateVersionId: d.templateVersionId,
                presentedHash: d.contentHash,
              })),
            };
            await tx.rentalDocument.createMany({ data: documents });
            await tx.documentPackage.update({
              where: { id },
              data: {
                status: "rendered",
                manifest: json(manifest),
                manifestHash: digest(canonical(manifest)),
                renderLeaseUntil: null,
              },
            });
            await this.support.event(tx, userId, id, "package.rendered");
            return id;
          },
        ),
      );
    } catch (error) {
      await this.support.prisma.documentPackage.updateMany({
        where: {
          id,
          status: { in: ["draft", "render_failed"] },
          renderLeaseUntil: leaseUntil,
        },
        data: {
          status: "render_failed",
          renderLeaseUntil: null,
          error:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Rendering failed",
        },
      });
      throw error;
    }
    return packageDto(await this.get(userId, id));
  }
  async publish(userId: string, id: string, key: string) {
    const pkg = await this.get(userId, id, "documents.manage");
    for (const document of pkg.documents) {
      const asset = await this.support.prisma.mediaAsset.findUniqueOrThrow({
        where: { id: document.presentedAssetId },
      });
      await this.support.read(asset);
    }
    await this.support.prisma.$transaction(async (tx) =>
      this.support.command(
        tx,
        key,
        "package.publish",
        id,
        { manifestHash: pkg.manifestHash },
        async () => {
          await this.support.require(userId, "documents.manage", tx);
          await tx.$queryRaw`SELECT id FROM "DocumentPackage" WHERE id = ${id} FOR UPDATE`;
          await assertPackageCurrent(tx, pkg);
          const current = await tx.documentPackage.findUniqueOrThrow({
            where: { id },
            include: packageInclude,
          });
          const snapshot = packageSnapshotSchema.parse(current.snapshot);
          const expected =
            snapshot.terms.promotion === "three_plus_one" ? 4 : 3;
          if (
            current.status !== "rendered" ||
            !current.manifestHash ||
            current.documents.length !== expected
          )
            throw new ConflictException(
              "Render the complete package before publication",
            );
          await tx.documentPackage.update({
            where: { id },
            data: { status: "published" },
          });
          await this.support.event(tx, userId, id, "package.published", {
            manifestHash: current.manifestHash,
          });
          return id;
        },
      ),
    );
    return packageDto(await this.get(userId, id));
  }
  async reviewIdentity(
    userId: string,
    id: string,
    input: z.infer<typeof v1.contracts.identityReviewInputSchema>,
  ) {
    const reference = await this.get(userId, id, "identity.review");
    await this.support.prisma.$transaction(async (tx) => {
      await this.support.require(userId, "identity.review", tx);
      const rental = await tx.rental.findUniqueOrThrow({
        where: { id: reference.rentalId },
        select: { id: true, scooterId: true },
      });
      await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${rental.scooterId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Rental" WHERE id = ${rental.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "DocumentPackage" WHERE id = ${id} FOR UPDATE`;
      const pkg = await tx.documentPackage.findUniqueOrThrow({ where: { id } });
      await assertPackageCurrent(tx, pkg);
      if (
        pkg.status !== "published" ||
        pkg.identityStatus !== "submitted" ||
        !pkg.phoneVerifiedAt ||
        pkg.selfieAssetId !== input.selfieAssetId ||
        pkg.identityDocumentId !== input.identityDocumentId
      )
        throw new ConflictException(
          "Review must reference the exact submitted selfie and identity document",
        );
      await tx.documentPackage.update({
        where: { id },
        data: {
          identityStatus: input.approved ? "approved" : "rejected",
          identityApprovedAt: input.approved ? new Date() : null,
          identityReviewedBy: userId,
          identityReviewReason: input.reason,
        },
      });
      await this.support.event(tx, userId, id, "identity.reviewed", {
        approved: input.approved,
        selfieAssetId: input.selfieAssetId,
        identityDocumentId: input.identityDocumentId,
      });
    });
    return packageDto(await this.get(userId, id));
  }
  async file(
    userId: string,
    documentId: string,
    variant: "presented" | "signed",
  ) {
    await this.support.require(userId, "documents.read");
    const company = await this.support.company();
    const document = await this.support.prisma.rentalDocument.findFirst({
      where: { id: documentId, package: { companyId: company.id } },
      include: { presentedAsset: true, signedAsset: true },
    });
    if (!document) throw new NotFoundException("Document unavailable");
    const asset =
      variant === "signed" ? document.signedAsset : document.presentedAsset;
    if (!asset) throw new NotFoundException("Signed file is not ready");
    const bytes = await this.support.read(asset);
    await this.support.event(
      this.support.prisma,
      userId,
      documentId,
      "document.downloaded",
      { variant },
    );
    return bytes;
  }
  async selfie(userId: string, id: string) {
    const pkg = await this.get(userId, id, "identity.review");
    if (!pkg.selfieAssetId) throw new NotFoundException("No selfie submitted");
    const asset = await this.support.prisma.mediaAsset.findUniqueOrThrow({
      where: { id: pkg.selfieAssetId },
    });
    const buffer = await this.support.read(asset);
    await this.support.event(
      this.support.prisma,
      userId,
      id,
      "identity.selfie_accessed",
    );
    return { buffer, contentType: asset.contentType };
  }
  async identityPhoto(userId: string, id: string, assetId: string) {
    const pkg = await this.get(userId, id, "identity.review");
    const snapshot = packageSnapshotSchema.parse(pkg.snapshot);
    const reference = snapshot.identityPhotos.find(
      (photo) => photo.assetId === assetId,
    );
    if (!reference)
      throw new NotFoundException(
        "The identity image is not part of this package",
      );
    const asset = await this.support.prisma.mediaAsset.findUniqueOrThrow({
      where: { id: assetId },
    });
    if (asset.checksumSha256 !== reference.sha256)
      throw new ConflictException(
        "Identity evidence differs from its pinned hash",
      );
    const buffer = await this.support.read(asset);
    await this.support.event(
      this.support.prisma,
      userId,
      id,
      "identity.document_photo_accessed",
      {
        assetId,
        photoId: reference.photoId,
        identityDocumentId: pkg.identityDocumentId,
      },
    );
    return { buffer, contentType: asset.contentType };
  }
  async evidence(userId: string, id: string) {
    const pkg = await this.get(userId, id, "evidence.export");
    const documents = await this.support.prisma.rentalDocument.findMany({
      where: { packageId: id },
      include: {
        signatures: true,
        templateVersion: true,
        presentedAsset: true,
        signedAsset: true,
      },
    });
    for (const d of documents) {
      await this.support.read(d.presentedAsset);
      if (d.signedAsset) await this.support.read(d.signedAsset);
    }
    const events = await this.support.prisma.auditEvent.findMany({
      where: {
        targetType: "ContractWorkflow",
        targetId: { in: [id, ...documents.map((d) => d.id)] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const [rental, inspections, payments, deliveries, sessions] =
      await Promise.all([
        this.support.prisma.rental.findUnique({ where: { id: pkg.rentalId } }),
        this.support.prisma.rentalInspection.findMany({
          where: { rentalId: pkg.rentalId },
        }),
        this.support.prisma.rentalPayment.findMany({
          where: { rentalId: pkg.rentalId },
        }),
        this.support.prisma.contractDelivery.findMany({
          where: { packageId: id },
        }),
        this.support.prisma.rentalSigningSession.findMany({
          where: { packageId: id },
          select: {
            id: true,
            phoneVerifiedAt: true,
            finalVerifiedAt: true,
            createdAt: true,
            revokedAt: true,
          },
        }),
      ]);
    await this.support.event(
      this.support.prisma,
      userId,
      id,
      "evidence.exported",
    );
    return {
      schemaVersion: 1,
      package: packageDto(pkg),
      snapshot: packageSnapshotSchema.parse(pkg.snapshot),
      manifest: pkg.manifest,
      documents,
      events,
      rental,
      inspections,
      payments,
      deliveries,
      sessions,
    };
  }

  /** An authorized offline export includes the actual retained objects, not just database IDs. */
  async evidenceArchive(userId: string, id: string): Promise<Buffer> {
    const evidence = await this.evidence(userId, id);
    const entries: Record<string, Buffer> = {};
    let total = 0;
    const addAsset = async (
      assetId: string,
      name: string,
      expectedHash?: string,
    ) => {
      const asset = await this.support.prisma.mediaAsset.findUniqueOrThrow({
        where: { id: assetId },
      });
      if (expectedHash && asset.checksumSha256 !== expectedHash)
        throw new ConflictException(
          "An evidence asset differs from its pinned hash",
        );
      const bytes = await this.support.read(asset);
      total += bytes.length;
      if (total > 100 * 1024 * 1024)
        throw new ConflictException(
          "Evidence exceeds the bounded export size; arrange an audited streamed export",
        );
      entries[name] = bytes;
    };
    for (const document of evidence.documents) {
      await addAsset(
        document.presentedAssetId,
        `documents/presented/${document.id}.pdf`,
        document.contentHash,
      );
      if (document.signedAssetId && document.signedHash)
        await addAsset(
          document.signedAssetId,
          `documents/signed/${document.id}.pdf`,
          document.signedHash,
        );
      const source = document.templateVersion;
      if (!entries[`templates/${source.id}.docx`])
        await addAsset(
          source.sourceAssetId,
          `templates/${source.id}.docx`,
          source.sourceSha256,
        );
      for (const signature of document.signatures)
        await addAsset(signature.assetId, `signatures/${signature.id}.png`);
    }
    const pkg = await this.support.prisma.documentPackage.findUniqueOrThrow({
      where: { id },
    });
    if (pkg.selfieAssetId)
      await addAsset(pkg.selfieAssetId, "identity/selfie.png");
    for (const photo of evidence.snapshot.identityPhotos)
      await addAsset(
        photo.assetId,
        `identity/${photo.photoId}.bin`,
        photo.sha256,
      );
    if (evidence.snapshot.logoAssetId)
      await addAsset(evidence.snapshot.logoAssetId, "branding/logo.bin");
    for (const media of evidence.snapshot.rentalMedia)
      await addAsset(
        media.assetId,
        `inspection/${media.photoId}.bin`,
        media.sha256,
      );
    for (const document of evidence.snapshot.vehicleDocuments)
      await addAsset(
        document.assetId,
        `vehicle/${document.documentId}.bin`,
        document.sha256,
      );
    entries["evidence.json"] = Buffer.from(JSON.stringify(evidence, null, 2));
    await this.support.event(
      this.support.prisma,
      userId,
      id,
      "evidence.archive_exported",
      { files: Object.keys(entries).length, totalBytes: total },
    );
    return writeDocxZip(new Map(Object.entries(entries)));
  }

  /** Final PDFs are new immutable assets; the bytes actually presented remain preserved. */
  async finalize(id: string): Promise<void> {
    const pkg = await this.support.prisma.documentPackage.findUniqueOrThrow({
      where: { id },
      include: {
        documents: {
          include: {
            signatures: { include: { asset: true } },
            templateVersion: { include: { template: true, sourceAsset: true } },
          },
        },
      },
    });
    if (pkg.status === "signed") return;
    if (
      pkg.status !== "published" ||
      !pkg.customerCompletedAt ||
      !pkg.companyAcceptedAt ||
      !pkg.identityApprovedAt ||
      !pkg.phoneVerifiedAt
    )
      throw new ConflictException(
        "All customer and company signing acts are required",
      );
    if (!this.env.CONTRACT_RENDERER_BINARY)
      throw new ServiceUnavailableException(
        "Private DOCX converter not configured",
      );
    const snapshot = packageSnapshotSchema.parse(pkg.snapshot);
    const results: { id: string; signedAssetId: string; signedHash: string }[] =
      [];
    const leaseUntil = new Date(Date.now() + 5 * 60_000);
    const lease = await this.support.prisma.documentPackage.updateMany({
      where: {
        id,
        status: "published",
        OR: [
          { renderLeaseUntil: null },
          { renderLeaseUntil: { lt: new Date() } },
        ],
      },
      data: { renderLeaseUntil: leaseUntil, error: null },
    });
    if (!lease.count)
      throw new ConflictException(
        "Final document conversion is already running",
      );
    try {
      for (const document of pkg.documents) {
        const roles = [
          "customer",
          "company",
          ...(document.requiresLimiterSignature ? ["limiter"] : []),
        ];
        if (
          roles.some(
            (role) =>
              !document.signatures.some(
                (s) =>
                  s.role === role && s.contentHash === document.contentHash,
              ),
          )
        )
          throw new ConflictException("Missing or mismatched signing evidence");
        const version = document.templateVersion;
        const source = await this.support.read(version.sourceAsset);
        if (
          version.rendererVersion !== RENDERER_VERSION ||
          version.schemaVersion !== REGISTRY_VERSION ||
          validateDocxTemplate(
            source,
            version.template.type as ContractTemplateType,
          ).manifestHash !== version.manifestHash
        )
          throw new ConflictException(
            "Pinned renderer or registry changed; finalize with the pinned runtime before upgrading",
          );
        const values: Record<string, TemplateValue> = {
          ...snapshotValues(
            snapshot,
            `${version.templateId}:${version.version}`,
          ),
        };
        if (snapshot.logoAssetId) {
          const logo = await this.support.prisma.mediaAsset.findUniqueOrThrow({
            where: { id: snapshot.logoAssetId },
          });
          values.companyLogo = {
            kind: "image",
            bytes: await this.support.read(logo),
            mimeType: logo.contentType as "image/png" | "image/jpeg",
            alt: snapshot.companyName,
          };
        }
        const suffix = ["RENTAL_AGREEMENT", "PROMOTION_ADDENDUM"].includes(
          document.type,
        )
          ? "Contract"
          : document.type === "GDPR_NOTICE"
            ? "Gdpr"
            : "Handover";
        for (const signature of document.signatures) {
          const key =
            signature.role === "limiter"
              ? "renterSignSpeed"
              : `${signature.role === "company" ? "company" : "renter"}Sign${suffix}`;
          values[key] = {
            kind: "image",
            bytes: await this.support.read(signature.asset),
            mimeType: "image/png",
            alt: `${signature.role}: ${signature.signerId}`,
          };
        }
        const rendered = renderDocxTemplate(
          source,
          version.template.type as ContractTemplateType,
          values,
          "FINAL_SIGNED",
        );
        const finalPdf = await convertDocxToPdf(
          rendered,
          this.env.CONTRACT_RENDERER_BINARY,
        );
        const asset = await this.support.store(finalPdf, "application/pdf");
        results.push({
          id: document.id,
          signedAssetId: asset.id,
          signedHash: asset.checksumSha256,
        });
      }
      await this.support.prisma.$transaction(async (tx) => {
        const reference = await tx.rental.findUniqueOrThrow({
          where: { id: pkg.rentalId },
        });
        await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${reference.scooterId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Rental" WHERE id = ${pkg.rentalId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "DocumentPackage" WHERE id = ${id} FOR UPDATE`;
        const current = await tx.documentPackage.findUniqueOrThrow({
          where: { id },
        });
        await assertPackageCurrent(tx, current);
        if (
          current.status !== "published" ||
          current.renderLeaseUntil?.getTime() !== leaseUntil.getTime() ||
          current.manifestHash !== pkg.manifestHash ||
          !current.identityApprovedAt ||
          !current.customerCompletedAt ||
          !current.companyAcceptedAt
        )
          throw new ConflictException(
            "Signing package changed during final conversion",
          );
        for (const result of results)
          await tx.rentalDocument.update({
            where: { id: result.id },
            data: {
              signedAssetId: result.signedAssetId,
              signedHash: result.signedHash,
              status: "signed",
              signedAt: new Date(),
            },
          });
        await tx.documentPackage.update({
          where: { id },
          data: {
            status: "signed",
            contractConcludedAt: new Date(),
            renderLeaseUntil: null,
          },
        });
        await tx.contractDelivery.create({
          data: { packageId: id, channel: "email" },
        });
        await this.support.event(tx, null, id, "package.concluded", {
          presentedManifestHash: pkg.manifestHash,
          finalFiles: results.map((r) => ({
            documentId: r.id,
            sha256: r.signedHash,
          })),
        });
      });
    } catch (error) {
      await this.support.prisma.documentPackage.updateMany({
        where: { id, status: "published", renderLeaseUntil: leaseUntil },
        data: {
          renderLeaseUntil: null,
          error:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Final conversion failed",
        },
      });
      throw error;
    }
  }
}
