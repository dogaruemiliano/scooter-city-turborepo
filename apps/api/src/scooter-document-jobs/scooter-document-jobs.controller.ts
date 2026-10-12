import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { v1 } from "@repo/api-shared";
import { createZodDto, ZodResponse } from "nestjs-zod";
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

@ApiTags("scooters")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "scooters", version: "1" })
export class ScooterDocumentJobsController {
  constructor(private readonly jobs: ScooterDocumentJobsService) {}

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
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ZodResponse({ status: 202, type: ScooterDocumentExtractionJob })
  start(
    @Body() input: StartScooterDocumentExtractionJobInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.jobs.start(input, user.id);
  }

  @Get("document-extraction-jobs/:id")
  @RequireAllScope("scooter_documents.extract")
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
