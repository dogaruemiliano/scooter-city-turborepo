import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { z } from "zod";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { ContractSupport, DOCX_MIME, digest, json } from "./contract-support";
import {
  validateDocxTemplate,
  renderDocxTemplate,
  REGISTRY_VERSION,
  RENDERER_VERSION,
  type ContractTemplateType,
} from "./engine/docx-engine";
import { convertDocxToPdf } from "./engine/pdf-converter";
import { previewValues } from "./engine/preview-values";
import { sanitizeSigningImage } from "./signing-images";

@Injectable()
export class TemplatesService {
  constructor(
    readonly support: ContractSupport,
    @Inject(ENV) readonly env: Env,
  ) {}
  async settings(userId: string) {
    await this.support.require(userId, "templates.read");
    const company = await this.support.company();
    const settings = await this.support.prisma.contractSettings.findUnique({
      where: { companyId: company.id },
    });
    return {
      companyId: company.id,
      settings: settings
        ? v1.contracts.contractSettingsInputSchema.parse(settings.data)
        : null,
    };
  }
  async saveSettings(userId: string, input: v1.contracts.ContractSettings) {
    return this.support.prisma.$transaction(async (tx) => {
      await this.support.require(userId, "templates.publish", tx);
      const company = await this.support.company(tx);
      // Serialize new branding references with privileged retention claims.
      await tx.$queryRaw`SELECT id FROM "FinanceLegalIdentity" WHERE id = ${company.id} FOR UPDATE`;
      if (input.logoAssetId) {
        await tx.$queryRaw`SELECT id FROM "MediaAsset" WHERE id = ${input.logoAssetId} FOR SHARE`;
        const logo = await tx.mediaAsset.findFirst({
          where: {
            id: input.logoAssetId,
            contractCompanyId: company.id,
            contractPurpose: "branding",
            deletedAt: null,
            retentionPurgeItemId: null,
          },
        });
        if (!logo || !["image/png", "image/jpeg"].includes(logo.contentType))
          throw new BadRequestException(
            "Upload an authorized company logo before selecting it",
          );
      }
      const representative = await tx.user.findFirst({
        where: {
          id: input.representativeUserId,
          deletedAt: null,
          loginStatus: "ACTIVE",
        },
      });
      if (
        !representative ||
        !representative.firstName ||
        !representative.lastName
      )
        throw new ConflictException(
          "An active named company representative is required",
        );
      await this.support.require(
        representative.id,
        "documents.company_sign",
        tx,
      );
      await tx.contractSettings.upsert({
        where: { companyId: company.id },
        create: { companyId: company.id, data: json(input) },
        update: { data: json(input), revision: { increment: 1 } },
      });
      await this.support.event(tx, userId, company.id, "settings.approved");
      return { settings: input, companyId: company.id };
    });
  }
  /** Logo provenance is explicit; an arbitrary private identity image cannot become branding. */
  async uploadLogo(userId: string, source: Express.Multer.File | undefined) {
    await this.support.require(userId, "templates.manage");
    const company = await this.support.company();
    if (!source || !["image/png", "image/jpeg"].includes(source.mimetype))
      throw new BadRequestException("A PNG or JPEG company logo is required");
    const bytes = await sanitizeSigningImage(source.buffer, false, "branding");
    const stored = await this.support.storage.storeImage({
      buffer: bytes,
      byteSize: bytes.length,
      contentType: "image/png",
      category: "contract-branding",
    });
    const assetId = await this.support.prisma.$transaction(async (tx) => {
      await this.support.require(userId, "templates.manage", tx);
      const asset = await tx.mediaAsset.create({
        data: {
          ...stored,
          uploadedByUserId: userId,
          contractCompanyId: company.id,
          contractPurpose: "branding",
        },
      });
      await this.support.event(tx, userId, asset.id, "branding.uploaded", {
        companyId: company.id,
        sha256: asset.checksumSha256,
      });
      return asset.id;
    });
    return v1.contracts.contractLogoUploadSchema.parse({ assetId });
  }
  async list(userId: string) {
    await this.support.require(userId, "templates.read");
    const company = await this.support.company();
    const [items, sets, settings] = await Promise.all([
      this.support.prisma.contractTemplate.findMany({
        where: { companyId: company.id },
        include: { versions: { orderBy: { version: "desc" } } },
        orderBy: { createdAt: "desc" },
      }),
      this.support.prisma.templateSetVersion.findMany({
        where: { companyId: company.id },
        orderBy: { version: "desc" },
      }),
      this.support.prisma.contractSettings.findUnique({
        where: { companyId: company.id },
      }),
    ]);
    return v1.contracts.templateListSchema.parse(
      JSON.parse(
        JSON.stringify({
          items,
          sets,
          activeSetId: settings?.activeSetId ?? null,
        }),
      ),
    );
  }
  async create(
    userId: string,
    input: z.infer<typeof v1.contracts.createTemplateInputSchema>,
  ) {
    return this.support.prisma.$transaction(async (tx) => {
      await this.support.require(userId, "templates.manage", tx);
      const company = await this.support.company(tx);
      const template = await tx.contractTemplate.create({
        data: { ...input, companyId: company.id, createdBy: userId },
      });
      await this.support.event(tx, userId, template.id, "template.created");
      return { ...template, versions: [] };
    });
  }
  async version(
    userId: string,
    id: string,
    permission: v1.access.PermissionKey = "templates.read",
  ) {
    await this.support.require(userId, permission);
    const company = await this.support.company();
    const version = await this.support.prisma.contractTemplateVersion.findFirst(
      {
        where: { id, template: { companyId: company.id } },
        include: {
          sourceAsset: true,
          template: true,
          previews: { include: { asset: true } },
        },
      },
    );
    if (!version) throw new NotFoundException("Template version not found");
    return version;
  }
  async upload(userId: string, templateId: string, file: Express.Multer.File) {
    await this.support.require(userId, "templates.manage");
    const company = await this.support.company();
    const template = await this.support.prisma.contractTemplate.findFirst({
      where: { id: templateId, companyId: company.id },
    });
    if (!template) throw new NotFoundException("Template not found");
    if (
      !file ||
      !file.originalname.toLowerCase().endsWith(".docx") ||
      file.size > 10 * 1024 * 1024
    )
      throw new ConflictException("A DOCX file up to 10 MiB is required");
    // Parsing checks actual ZIP/XML content, macros, external relationships and expansion limits.
    const report = validateDocxTemplate(
      file.buffer,
      template.type as ContractTemplateType,
    );
    const asset = await this.support.store(file.buffer, DOCX_MIME, userId);
    return this.support.prisma.$transaction(async (tx) => {
      await this.support.require(userId, "templates.manage", tx);
      await tx.$queryRaw`SELECT id FROM "ContractTemplate" WHERE id = ${templateId} FOR UPDATE`;
      const latest = await tx.contractTemplateVersion.findFirst({
        where: { templateId },
        orderBy: { version: "desc" },
      });
      const version = await tx.contractTemplateVersion.create({
        data: {
          templateId,
          version: (latest?.version ?? 0) + 1,
          sourceAssetId: asset.id,
          sourceSha256: asset.checksumSha256,
          rendererVersion: RENDERER_VERSION,
          schemaVersion: REGISTRY_VERSION,
          createdBy: userId,
          validation: json(report),
          validationStatus: "PENDING",
        },
      });
      await this.support.event(
        tx,
        userId,
        version.id,
        "template.source_uploaded",
        { sourceSha256: asset.checksumSha256 },
      );
      return JSON.parse(JSON.stringify(version)) as unknown;
    });
  }
  /** PDF work deliberately happens outside SQL transactions. A stale or partial run cannot publish. */
  async validate(userId: string, id: string) {
    const version = await this.version(userId, id, "templates.manage");
    if (version.status !== "DRAFT")
      throw new ConflictException("Published sources are immutable");
    if (!this.env.CONTRACT_RENDERER_BINARY)
      throw new ServiceUnavailableException(
        "Configure CONTRACT_RENDERER_BINARY before generating previews",
      );
    const source = await this.support.read(version.sourceAsset);
    const report = validateDocxTemplate(
      source,
      version.template.type as ContractTemplateType,
    );
    const claimed =
      await this.support.prisma.contractTemplateVersion.updateMany({
        where: {
          id,
          status: "DRAFT",
          sourceSha256: report.sourceSha256,
          validationStatus: { not: "RUNNING" },
        },
        data: {
          validationStatus: "RUNNING",
          approvedBy: null,
          approvedAt: null,
          manifestHash: null,
        },
      });
    if (!claimed.count)
      throw new ConflictException(
        "Template changed or validation is already running",
      );
    try {
      if (report.status !== "PASSED")
        throw new ConflictException({
          message: "Template validation failed",
          details: report,
        });
      const previews: { scenario: string; assetId: string }[] = [];
      for (const scenario of [
        "25",
        "45",
        "NO_LIMITER",
        "LONG_NAMES",
        "ABSENT_EQUIPMENT",
        "DEFECTS",
      ] as const) {
        const values = previewValues(
          version.template.type as ContractTemplateType,
          scenario,
        );
        const rendered = renderDocxTemplate(
          source,
          version.template.type as ContractTemplateType,
          values,
        );
        const pdf = await convertDocxToPdf(
          rendered,
          this.env.CONTRACT_RENDERER_BINARY,
        );
        const asset = await this.support.store(pdf, "application/pdf", userId);
        previews.push({ scenario, assetId: asset.id });
      }
      await this.support.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ContractTemplateVersion" WHERE id = ${id} FOR UPDATE`;
        const current = await tx.contractTemplateVersion.findUniqueOrThrow({
          where: { id },
        });
        if (
          current.status !== "DRAFT" ||
          current.sourceSha256 !== report.sourceSha256
        )
          throw new ConflictException("Template changed during validation");
        for (const preview of previews)
          await tx.contractPreview.upsert({
            where: {
              versionId_manifestHash_scenario: {
                versionId: id,
                manifestHash: report.manifestHash,
                scenario: preview.scenario,
              },
            },
            create: {
              versionId: id,
              manifestHash: report.manifestHash,
              ...preview,
            },
            update: { assetId: preview.assetId },
          });
        await tx.contractTemplateVersion.update({
          where: { id },
          data: {
            validationStatus: "PASSED",
            manifestHash: report.manifestHash,
            validation: json(report),
            approvedBy: null,
            approvedAt: null,
          },
        });
        await this.support.event(tx, userId, id, "template.validated", {
          manifestHash: report.manifestHash,
        });
      });
      return this.version(userId, id);
    } catch (error) {
      await this.support.prisma.contractTemplateVersion.updateMany({
        where: { id, status: "DRAFT" },
        data: {
          validationStatus: "FAILED",
          validation: json(report),
          manifestHash: null,
        },
      });
      throw error;
    }
  }
  async approve(
    userId: string,
    id: string,
    input: z.infer<typeof v1.contracts.approveTemplateInputSchema>,
  ) {
    const version = await this.version(userId, id, "templates.publish");
    const source = await this.support.read(version.sourceAsset);
    const report = validateDocxTemplate(
      source,
      version.template.type as ContractTemplateType,
    );
    if (
      report.status !== "PASSED" ||
      report.manifestHash !== input.manifestHash ||
      version.manifestHash !== input.manifestHash ||
      version.validationStatus !== "PASSED" ||
      version.previews.filter((p) => p.manifestHash === input.manifestHash)
        .length !== 6
    )
      throw new ConflictException(
        "Review current successful previews before approval",
      );
    return this.support.prisma.$transaction(async (tx) => {
      await this.support.require(userId, "templates.publish", tx);
      const changed = await tx.contractTemplateVersion.updateMany({
        where: {
          id,
          status: "DRAFT",
          manifestHash: input.manifestHash,
          validationStatus: "PASSED",
        },
        data: {
          approvedBy: userId,
          approvedAt: new Date(),
          reviewStatement: input.reviewStatement,
        },
      });
      if (!changed.count) throw new ConflictException("Approval is stale");
      await this.support.event(tx, userId, id, "template.approved", {
        manifestHash: input.manifestHash,
      });
      return { id, approved: true };
    });
  }
  async publish(userId: string, id: string, key: string) {
    const version = await this.version(userId, id, "templates.publish");
    const report = validateDocxTemplate(
      await this.support.read(version.sourceAsset),
      version.template.type as ContractTemplateType,
    );
    for (const preview of version.previews.filter(
      (p) => p.manifestHash === report.manifestHash,
    ))
      await this.support.read(preview.asset);
    await this.support.prisma.$transaction(async (tx) =>
      this.support.command(
        tx,
        key,
        "template.publish",
        id,
        { manifest: report.manifestHash },
        async () => {
          await this.support.require(userId, "templates.publish", tx);
          await tx.$queryRaw`SELECT id FROM "ContractTemplateVersion" WHERE id = ${id} FOR UPDATE`;
          const row = await tx.contractTemplateVersion.findUniqueOrThrow({
            where: { id },
          });
          if (
            row.status !== "DRAFT" ||
            !row.approvedBy ||
            report.status !== "PASSED" ||
            row.manifestHash !== report.manifestHash ||
            row.validationStatus !== "PASSED" ||
            version.previews.filter(
              (p) => p.manifestHash === report.manifestHash,
            ).length !== 6
          )
            throw new ConflictException(
              "Current successful validation, previews and explicit approval are required",
            );
          await tx.contractTemplateVersion.update({
            where: { id },
            data: { status: "PUBLISHED", publishedAt: new Date() },
          });
          await this.support.event(tx, userId, id, "template.published", {
            manifestHash: report.manifestHash,
          });
          return id;
        },
      ),
    );
    return this.version(userId, id);
  }
  async archive(userId: string, id: string) {
    const version = await this.version(userId, id, "templates.archive");
    await this.support.prisma.$transaction(async (tx) => {
      await tx.contractTemplateVersion.update({
        where: { id: version.id },
        data: { status: "ARCHIVED" },
      });
      await this.support.event(tx, userId, id, "template.archived");
    });
    return { id, status: "ARCHIVED" };
  }
  async createSet(
    userId: string,
    input: z.infer<typeof v1.contracts.createTemplateSetInputSchema>,
  ) {
    return this.support.prisma.$transaction(async (tx) => {
      await this.support.require(userId, "templates.publish", tx);
      const company = await this.support.company(tx);
      await tx.$queryRaw`SELECT id FROM "FinanceLegalIdentity" WHERE id = ${company.id} FOR UPDATE`;
      const references = [
        [input.agreementVersionId, "RENTAL_AGREEMENT"],
        [input.gdprVersionId, "GDPR_NOTICE"],
        [input.technicalVersionId, "TECHNICAL_HANDOVER"],
        ...(input.promotionVersionId
          ? [[input.promotionVersionId, "PROMOTION_ADDENDUM"]]
          : []),
      ];
      const manifests: string[] = [];
      for (const [id, type] of references) {
        const version = await tx.contractTemplateVersion.findFirst({
          where: {
            id,
            status: "PUBLISHED",
            schemaVersion: REGISTRY_VERSION,
            rendererVersion: RENDERER_VERSION,
            template: { companyId: company.id, locale: input.locale, type },
          },
        });
        if (!version?.manifestHash)
          throw new ConflictException(
            "Only compatible published versions can form a template set",
          );
        manifests.push(version.manifestHash);
      }
      if (input.promotionApproved && !input.promotionVersionId)
        throw new ConflictException(
          "An approved promotion addendum is required",
        );
      const previous = await tx.templateSetVersion.findFirst({
        where: { companyId: company.id, locale: input.locale },
        orderBy: { version: "desc" },
      });
      const set = await tx.templateSetVersion.create({
        data: {
          ...input,
          companyId: company.id,
          version: (previous?.version ?? 0) + 1,
          manifestHash: digest(JSON.stringify({ input, manifests })),
          createdBy: userId,
        },
      });
      await this.support.event(tx, userId, set.id, "template_set.created");
      return JSON.parse(JSON.stringify(set)) as unknown;
    });
  }
  async activate(
    userId: string,
    id: string,
    input: z.infer<typeof v1.contracts.activateTemplateSetInputSchema>,
  ) {
    await this.support.prisma.$transaction(async (tx) =>
      this.support.command(
        tx,
        input.idempotencyKey,
        "set.activate",
        id,
        input,
        async () => {
          await this.support.require(userId, "templates.publish", tx);
          const company = await this.support.company(tx);
          await tx.$queryRaw`SELECT "companyId" FROM "ContractSettings" WHERE "companyId" = ${company.id} FOR UPDATE`;
          const settings = await tx.contractSettings.findUnique({
            where: { companyId: company.id },
          });
          const set = await tx.templateSetVersion.findFirst({
            where: { id, companyId: company.id },
            include: {
              agreementVersion: true,
              gdprVersion: true,
              technicalVersion: true,
              promotionVersion: true,
            },
          });
          if (
            !settings ||
            !set ||
            settings.activeSetId !== input.expectedActiveSetId
          )
            throw new ConflictException(
              "Active template set changed or settings are missing",
            );
          if (
            [
              set.agreementVersion,
              set.gdprVersion,
              set.technicalVersion,
              ...(set.promotionVersion ? [set.promotionVersion] : []),
            ].some(
              (v) =>
                v.status !== "PUBLISHED" ||
                v.rendererVersion !== RENDERER_VERSION ||
                v.schemaVersion !== REGISTRY_VERSION,
            )
          )
            throw new ConflictException(
              "Set contains unavailable or incompatible template versions",
            );
          await tx.contractSettings.update({
            where: { companyId: company.id },
            data: { activeSetId: id, revision: { increment: 1 } },
          });
          await this.support.event(tx, userId, id, "template_set.activated", {
            previousSetId: settings.activeSetId,
            reason: input.reason,
          });
          return id;
        },
      ),
    );
    return { activeSetId: id };
  }
}
