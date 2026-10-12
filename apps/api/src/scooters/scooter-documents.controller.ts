import { RequireAllScope } from "../access/access.decorators";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { v1 } from "@repo/api-shared";
import { createZodDto, ZodResponse } from "nestjs-zod";
import type { Response } from "express";
import { pipeline } from "node:stream/promises";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ScooterDocumentsService } from "./scooter-documents.service";

class AnalyzeScooterDocumentInput extends createZodDto(
  v1.scooters.analyzeScooterDocumentInputSchema,
) {}
class CreateScooterDocumentUpload extends createZodDto(
  v1.scooters.createScooterDocumentUploadSchema,
) {}
class ScooterDocumentUpload extends createZodDto(
  v1.scooters.scooterDocumentUploadSchema,
) {}
class ScooterDocumentList extends createZodDto(
  v1.scooters.scooterDocumentListSchema,
) {}

@ApiTags("scooters")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "scooters", version: "1" })
export class ScooterDocumentsController {
  constructor(private readonly documents: ScooterDocumentsService) {}

  @RequireAllScope("scooter_documents.extract")
  @Post("document-extraction")
  @HttpCode(HttpStatus.SERVICE_UNAVAILABLE)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    operationId: "ScooterDocumentsController_analyzeDocument_v1",
    summary: "Retired synchronous extraction; use document-extraction-jobs",
    deprecated: true,
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description:
      "Synchronous extraction is retired. Reload the editor to use background jobs.",
  })
  analyzeDocument(@Body() input: AnalyzeScooterDocumentInput): never {
    void input;
    throw new ServiceUnavailableException({
      code: "DOCUMENT_EXTRACTION_DISABLED",
      message:
        "Reload the editor to use background document extraction. Manual entry remains available.",
    });
  }

  @RequireAllScope("scooter_documents.write")
  @Post("document-draft-upload-url")
  @ZodResponse({ status: 201, type: ScooterDocumentUpload })
  createUpload(
    @Body() input: CreateScooterDocumentUpload,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.documents.createUpload(input, user.id);
  }

  @RequireAllScope("scooter_documents.read")
  @Get(":id/documents")
  @ZodResponse({ type: ScooterDocumentList })
  list(@Param("id") id: string) {
    return this.documents.list(id);
  }

  @RequireAllScope("scooter_documents.read")
  @Get(":id/documents/:documentId/content")
  async content(
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Res() res: Response,
  ) {
    const content = await this.documents.content(id, documentId);
    res.setHeader("Content-Type", content.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    if (content.contentLength !== null)
      res.setHeader("Content-Length", String(content.contentLength));
    await pipeline(content.body, res);
  }
}
