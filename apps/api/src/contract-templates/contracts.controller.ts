import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createZodDto } from "nestjs-zod";
import type { Request, Response } from "express";
import { v1 } from "@repo/api-shared";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../access/access.decorators";
import { TemplatesService } from "./templates.service";
import { PackagesService, packageDto } from "./packages.service";
import { SigningService } from "./signing.service";
import { DOCX_MIME } from "./contract-support";
import { ContractDeliveryService } from "./delivery.service";

class CreateTemplate extends createZodDto(
  v1.contracts.createTemplateInputSchema,
) {}
class Settings extends createZodDto(v1.contracts.contractSettingsInputSchema) {}
class Approve extends createZodDto(v1.contracts.approveTemplateInputSchema) {}
class Command extends createZodDto(v1.contracts.idempotentInputSchema) {}
class CreateSet extends createZodDto(
  v1.contracts.createTemplateSetInputSchema,
) {}
class Activate extends createZodDto(
  v1.contracts.activateTemplateSetInputSchema,
) {}
class CreatePackage extends createZodDto(
  v1.contracts.createPackageInputSchema,
) {}
class Invite extends createZodDto(v1.contracts.inviteInputSchema) {}
class IdentityReview extends createZodDto(
  v1.contracts.identityReviewInputSchema,
) {}
class CompanySign extends createZodDto(v1.contracts.companySignInputSchema) {}
class RetryDelivery extends createZodDto(
  v1.contracts.retryDeliveryInputSchema,
) {}

function file(
  res: Response,
  buffer: Buffer,
  contentType: string,
  name: string,
) {
  res
    .set({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    })
    .send(buffer);
}

@Controller({ path: "contracts", version: "1" })
export class ContractsController {
  constructor(
    readonly templates: TemplatesService,
    readonly packages: PackagesService,
    readonly signing: SigningService,
    readonly delivery: ContractDeliveryService,
  ) {}
  @Get("packages/:id/deliveries")
  @RequirePermissions("documents.read")
  deliveries(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    return this.delivery.list(user.id, id);
  }
  @Post("deliveries/:id/retry")
  @RequirePermissions("documents.manage")
  retryDelivery(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: RetryDelivery,
  ) {
    return this.delivery.retry(
      user.id,
      id,
      input.confirmedNotSent,
      input.reason,
    );
  }
  @Get("settings")
  @RequirePermissions("templates.read")
  settings(@CurrentUser() user: AuthPrincipal) {
    return this.templates.settings(user.id);
  }
  @Post("settings/logo")
  @RequirePermissions("templates.manage")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  uploadLogo(
    @CurrentUser() user: AuthPrincipal,
    @UploadedFile() source: Express.Multer.File | undefined,
  ) {
    return this.templates.uploadLogo(user.id, source);
  }
  @Put("settings")
  @RequirePermissions("templates.publish")
  saveSettings(@CurrentUser() user: AuthPrincipal, @Body() input: Settings) {
    return this.templates.saveSettings(user.id, input);
  }
  @Get("templates")
  @RequirePermissions("templates.read")
  list(@CurrentUser() user: AuthPrincipal) {
    return this.templates.list(user.id);
  }
  @Post("templates")
  @RequirePermissions("templates.manage")
  create(@CurrentUser() user: AuthPrincipal, @Body() input: CreateTemplate) {
    return this.templates.create(user.id, input);
  }
  @Post("templates/:id/versions")
  @RequirePermissions("templates.manage")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1 },
    }),
  )
  upload(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @UploadedFile() source: Express.Multer.File,
  ) {
    return this.templates.upload(user.id, id, source);
  }
  @Post("versions/:id/validate")
  @RequirePermissions("templates.manage")
  validate(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    return this.templates.validate(user.id, id);
  }
  @Get("versions/:id/validation")
  @RequirePermissions("templates.read")
  async validation(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
  ) {
    const version = await this.templates.version(user.id, id);
    return {
      status: version.validationStatus,
      validation: version.validation,
      manifestHash: version.manifestHash,
    };
  }
  @Post("versions/:id/approve")
  @RequirePermissions("templates.publish")
  approve(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: Approve,
  ) {
    return this.templates.approve(user.id, id, input);
  }
  @Post("versions/:id/publish")
  @RequirePermissions("templates.publish")
  publish(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: Command,
  ) {
    return this.templates.publish(user.id, id, input.idempotencyKey);
  }
  @Post("versions/:id/archive")
  @RequirePermissions("templates.archive")
  archive(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    return this.templates.archive(user.id, id);
  }
  @Get("versions/:id/source")
  @RequirePermissions("templates.read")
  async source(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const version = await this.templates.version(user.id, id);
    const bytes = await this.templates.support.read(version.sourceAsset);
    await this.templates.support.event(
      this.templates.support.prisma,
      user.id,
      id,
      "template.source_downloaded",
    );
    file(res, bytes, DOCX_MIME, `${version.id}.docx`);
  }
  @Get("versions/:id/previews/:scenario")
  @RequirePermissions("templates.read")
  async preview(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Param("scenario") scenario: string,
    @Res() res: Response,
  ) {
    const version = await this.templates.version(user.id, id);
    const preview = version.previews.find(
      (p) => p.scenario === scenario && p.manifestHash === version.manifestHash,
    );
    if (!preview) {
      res.status(404).end();
      return;
    }
    file(
      res,
      await this.templates.support.read(preview.asset),
      "application/pdf",
      `${version.id}-${scenario}.pdf`,
    );
  }
  @Post("sets")
  @RequirePermissions("templates.publish")
  createSet(@CurrentUser() user: AuthPrincipal, @Body() input: CreateSet) {
    return this.templates.createSet(user.id, input);
  }
  @Post("sets/:id/activate")
  @RequirePermissions("templates.publish")
  activate(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: Activate,
  ) {
    return this.templates.activate(user.id, id, input);
  }
  @Get("rentals/:id/packages")
  @RequirePermissions("documents.read")
  listPackages(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    return this.packages.list(user.id, id);
  }
  @Post("rentals/:id/packages")
  @RequirePermissions("documents.manage")
  createPackage(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: CreatePackage,
  ) {
    return this.packages.create(user.id, id, input);
  }
  @Post("packages/:id/render")
  @RequirePermissions("documents.manage")
  renderPackage(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: Command,
  ) {
    return this.packages.render(user.id, id, input.idempotencyKey);
  }
  @Post("packages/:id/publish")
  @RequirePermissions("documents.manage")
  publishPackage(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: Command,
  ) {
    return this.packages.publish(user.id, id, input.idempotencyKey);
  }
  @Post("packages/:id/invite")
  @RequirePermissions("documents.manage")
  async invite(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: Invite,
  ) {
    await this.signing.invite(user.id, id, input);
    return packageDto(await this.packages.get(user.id, id));
  }
  @Post("packages/:id/identity-review")
  @RequirePermissions("identity.review")
  reviewIdentity(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: IdentityReview,
  ) {
    return this.packages.reviewIdentity(user.id, id, input);
  }
  @Post("packages/:id/company-sign")
  @RequirePermissions("documents.company_sign")
  companySign(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: CompanySign,
    @Req() req: Request,
  ) {
    return this.signing.companySign(user.id, id, input, {
      authenticatedSessionId: user.sessionId,
      ip: req.ip ?? null,
      userAgent: req.header("user-agent") ?? null,
    });
  }
  @Post("packages/:id/finalize")
  @RequirePermissions("documents.manage")
  async finalize(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    await this.packages.get(user.id, id, "documents.manage");
    await this.packages.finalize(id);
    return this.packages.list(
      user.id,
      (await this.packages.get(user.id, id)).rentalId,
    );
  }
  @Get("packages/:id/selfie")
  @RequirePermissions("identity.review")
  async selfie(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const result = await this.packages.selfie(user.id, id);
    file(res, result.buffer, result.contentType, "identity-review");
  }
  @Get("packages/:id/evidence")
  @RequirePermissions("evidence.export")
  async evidence(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    file(
      res,
      Buffer.from(
        JSON.stringify(await this.packages.evidence(user.id, id), null, 2),
      ),
      "application/json",
      `${id}-evidence.json`,
    );
  }
  @Get("packages/:id/evidence/archive")
  @RequirePermissions("evidence.export")
  async evidenceArchive(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    file(
      res,
      await this.packages.evidenceArchive(user.id, id),
      "application/zip",
      `${id}-evidence.zip`,
    );
  }
  @Get("packages/:id/identity-photos/:assetId")
  @RequirePermissions("identity.review")
  async identityPhoto(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Param("assetId") assetId: string,
    @Res() res: Response,
  ) {
    const result = await this.packages.identityPhoto(user.id, id, assetId);
    const extension =
      (
        {
          "application/pdf": "pdf",
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/webp": "webp",
        } as Record<string, string>
      )[result.contentType] ?? "bin";
    file(
      res,
      result.buffer,
      result.contentType,
      `identity-document.${extension}`,
    );
  }
  @Get("documents/:id/file")
  @RequirePermissions("documents.read")
  async document(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Query("variant") variant: string,
    @Res() res: Response,
  ) {
    file(
      res,
      await this.packages.file(
        user.id,
        id,
        variant === "signed" ? "signed" : "presented",
      ),
      "application/pdf",
      `${id}.pdf`,
    );
  }
}
