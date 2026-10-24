import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { v1 } from "@repo/api-shared";
import { createZodDto, ZodResponse } from "nestjs-zod";
import type { Response } from "express";
import { pipeline } from "node:stream/promises";
import {
  RequireAllScope,
  RequireAnyAllScope,
} from "../access/access.decorators";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ScooterDocumentJobsService } from "./scooter-document-jobs.service";

class StartScooterDocumentExtractionJobInput extends createZodDto(
  v1.scooters.startScooterDocumentExtractionJobInputSchema,
) {}
class ScooterDocumentExtractionJob extends createZodDto(
  v1.scooters.scooterDocumentExtractionJobSchema,
) {}
class ScooterDocumentEditorSession extends createZodDto(
  v1.scooters.scooterDocumentEditorSessionSchema,
) {}
class DiscardScooterDocumentEditorSession extends createZodDto(
  v1.scooters.discardScooterDocumentEditorSessionSchema,
) {}
class CreateScooterImportDraft extends createZodDto(
  v1.scooters.createScooterImportDraftSchema,
) {}
class MergeScooterImportDraft extends createZodDto(
  v1.scooters.mergeScooterImportDraftSchema,
) {}
class UpdateScooterImportDraft extends createZodDto(
  v1.scooters.updateScooterImportDraftSchema,
) {}
class ScooterImportDraft extends createZodDto(
  v1.scooters.scooterImportDraftSchema,
) {}
class ScooterImportDraftList extends createZodDto(
  v1.scooters.scooterImportDraftListSchema,
) {}
class ImportDraftDocumentContent extends createZodDto(
  v1.scooters.analyzeScooterDocumentInputSchema,
) {}
class ImportDraftPhotoContent extends createZodDto(
  v1.scooters.scooterImportDraftPhotoContentInputSchema,
) {}

@ApiTags("scooters")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "scooters", version: "1" })
export class ScooterDocumentJobsController {
  constructor(private readonly jobs: ScooterDocumentJobsService) {}

  @Post("import-drafts")
  @RequireAllScope("scooters.create")
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @ZodResponse({ status: 201, type: ScooterImportDraft })
  createImportDraft(
    @Body() input: CreateScooterImportDraft,
    @CurrentUser() user: AuthPrincipal,
  ) {
    void input;
    return this.jobs.createImportDraft(user.id);
  }

  @Get("import-drafts")
  @RequireAllScope("scooters.create")
  @ZodResponse({ type: ScooterImportDraftList })
  listImportDrafts(@CurrentUser() user: AuthPrincipal) {
    return this.jobs.listImportDrafts(user.id);
  }

  @Get("import-drafts/:id")
  @RequireAllScope("scooters.create")
  @ZodResponse({ type: ScooterImportDraft })
  getImportDraft(@Param("id") id: string, @CurrentUser() user: AuthPrincipal) {
    return this.jobs.getImportDraft(id, user.id);
  }

  @Patch("import-drafts/:id")
  @RequireAllScope("scooters.create")
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @ZodResponse({ type: ScooterImportDraft })
  updateImportDraft(
    @Param("id") id: string,
    @Body() input: UpdateScooterImportDraft,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.jobs.updateImportDraft(id, input, user.id);
  }

  @Post("import-drafts/:id/merge")
  @RequireAllScope("scooters.create", "scooter_documents.write")
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ type: ScooterImportDraft })
  mergeImportDraft(
    @Param("id") id: string,
    @Body() input: MergeScooterImportDraft,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.jobs.mergeImportDraft(id, input, user.id);
  }

  @Post("import-drafts/:id/discard")
  @RequireAllScope("scooters.create")
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ type: DiscardScooterDocumentEditorSession })
  discardImportDraft(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.jobs.discardImportDraft(id, user.id);
  }

  @Post("import-drafts/:id/document-content")
  @RequireAllScope("scooters.create", "scooter_documents.read")
  @HttpCode(HttpStatus.OK)
  async importDraftDocumentContent(
    @Param("id") id: string,
    @Body() input: ImportDraftDocumentContent,
    @CurrentUser() user: AuthPrincipal,
    @Res() res: Response,
  ) {
    const content = await this.jobs.importDraftDocumentContent(
      id,
      input,
      user.id,
    );
    res.setHeader("Content-Type", content.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    if (content.contentLength !== null)
      res.setHeader("Content-Length", String(content.contentLength));
    await pipeline(content.body, res);
  }

  @Post("import-drafts/:id/photo-content")
  @RequireAllScope("scooters.create")
  @HttpCode(HttpStatus.OK)
  async importDraftPhotoContent(
    @Param("id") id: string,
    @Body() input: ImportDraftPhotoContent,
    @CurrentUser() user: AuthPrincipal,
    @Res() res: Response,
  ) {
    const content = await this.jobs.importDraftPhotoContent(
      id,
      input.uploadToken,
      user.id,
    );
    res.setHeader("Content-Type", content.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    if (content.contentLength !== null)
      res.setHeader("Content-Length", String(content.contentLength));
    await pipeline(content.body, res);
  }

  @Post("document-editor-sessions")
  @RequireAnyAllScope(
    "scooters.create",
    "scooters.update",
    "scooter_documents.write",
    "scooter_documents.extract",
  )
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ZodResponse({ status: 201, type: ScooterDocumentEditorSession })
  createSession(@CurrentUser() user: AuthPrincipal) {
    return this.jobs.createSession(user.id);
  }

  @Post("document-editor-sessions/:id/discard")
  @RequireAnyAllScope(
    "scooters.create",
    "scooters.update",
    "scooter_documents.write",
    "scooter_documents.extract",
  )
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ type: DiscardScooterDocumentEditorSession })
  discard(@Param("id") id: string, @CurrentUser() user: AuthPrincipal) {
    return this.jobs.discardSession(id, user.id);
  }

  @Post("document-extraction-jobs")
  @RequireAllScope("scooter_documents.extract")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 400, ttl: 60_000 } })
  @ZodResponse({ status: 202, type: ScooterDocumentExtractionJob })
  start(
    @Body() input: StartScooterDocumentExtractionJobInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.jobs.start(input, user.id);
  }

  @Get("document-extraction-jobs/:id")
  @RequireAllScope("scooter_documents.extract")
  @Throttle({ default: { limit: 10_000, ttl: 60_000 } })
  @ZodResponse({ type: ScooterDocumentExtractionJob })
  status(@Param("id") id: string, @CurrentUser() user: AuthPrincipal) {
    return this.jobs.status(id, user.id);
  }

  @Post("document-extraction-jobs/:id/cancel")
  @RequireAllScope("scooter_documents.extract")
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ type: ScooterDocumentExtractionJob })
  cancel(@Param("id") id: string, @CurrentUser() user: AuthPrincipal) {
    return this.jobs.cancel(id, user.id);
  }
}
