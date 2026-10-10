import { Body, Controller, Get, Param, Post, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { createZodDto, ZodResponse } from "nestjs-zod";
import type { Response } from "express";
import { pipeline } from "node:stream/promises";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequireRoles } from "../common/decorators/roles.decorator";
import { ScooterDocumentsService } from "./scooter-documents.service";

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
@RequireRoles("ADMIN")
@Controller({ path: "scooters", version: "1" })
export class ScooterDocumentsController {
  constructor(private readonly documents: ScooterDocumentsService) {}

  @Post("document-draft-upload-url")
  @ZodResponse({ status: 201, type: ScooterDocumentUpload })
  createUpload(
    @Body() input: CreateScooterDocumentUpload,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.documents.createUpload(input, user.id);
  }

  @Get(":id/documents")
  @ZodResponse({ type: ScooterDocumentList })
  list(@Param("id") id: string) {
    return this.documents.list(id);
  }

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
