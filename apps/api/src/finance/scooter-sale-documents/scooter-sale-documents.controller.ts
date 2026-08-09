import { Body, Controller, Get, Param, Post, Put, Res } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import type { Response } from "express";
import { pipeline } from "node:stream/promises";
import { ZodResponse } from "nestjs-zod";

import type { AuthPrincipal } from "../../auth/auth.types";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { RequireRoles } from "../../common/decorators/roles.decorator";
import { CompleteScooterSaleDocumentUploadInput } from "./dto/complete-scooter-sale-document-upload.input";
import { CreateScooterSaleDocumentUploadUrlInput } from "./dto/create-scooter-sale-document-upload-url.input";
import { ScooterSaleDocumentUploadUrl } from "./dto/scooter-sale-document-upload-url";
import { ScooterSaleDocument } from "./dto/scooter-sale-document";
import { UpsertScooterSaleDocumentInput } from "./dto/upsert-scooter-sale-document.input";
import { toScooterSaleDocument } from "./scooter-sale-document.mapper";
import { ScooterSaleDocumentsService } from "./scooter-sale-documents.service";

@ApiTags("finance-scooter-sale-documents")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "finance/scooter-sales/:saleId/document", version: "1" })
export class ScooterSaleDocumentsController {
  constructor(private readonly documents: ScooterSaleDocumentsService) {}

  @Get()
  @ApiOperation({
    operationId: "ScooterSaleDocumentsController_get_v1",
    summary: "Get the bill attached to a scooter sale",
  })
  @ZodResponse({ type: ScooterSaleDocument })
  async get(
    @Param("saleId") saleId: string,
  ): Promise<v1.finance.ScooterSaleDocument> {
    return toScooterSaleDocument(await this.documents.get(saleId));
  }

  @Put()
  @ApiOperation({
    operationId: "ScooterSaleDocumentsController_upsert_v1",
    summary: "Create or update the bill metadata for a scooter sale",
  })
  @ZodResponse({ type: ScooterSaleDocument })
  async upsert(
    @Param("saleId") saleId: string,
    @Body() input: UpsertScooterSaleDocumentInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.ScooterSaleDocument> {
    return toScooterSaleDocument(
      await this.documents.upsert(saleId, input, actor.id),
    );
  }

  @Post("upload-url")
  @ApiOperation({
    operationId: "ScooterSaleDocumentsController_createUploadUrl_v1",
    summary: "Create a checksum-bound private S3 PUT URL for the sale bill",
  })
  @ZodResponse({ type: ScooterSaleDocumentUploadUrl })
  createUploadUrl(
    @Param("saleId") saleId: string,
    @Body() input: CreateScooterSaleDocumentUploadUrlInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.ScooterSaleDocumentUploadUrl> {
    return this.documents.createUploadUrl(saleId, input, actor.id);
  }

  @Post("complete-upload")
  @ApiOperation({
    operationId: "ScooterSaleDocumentsController_completeUpload_v1",
    summary: "Validate and attach the uploaded sale bill",
  })
  @ZodResponse({ type: ScooterSaleDocument })
  async completeUpload(
    @Param("saleId") saleId: string,
    @Body() input: CompleteScooterSaleDocumentUploadInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.ScooterSaleDocument> {
    return toScooterSaleDocument(
      await this.documents.completeUpload(saleId, input, actor.id),
    );
  }

  @Get("content")
  @ApiOperation({
    operationId: "ScooterSaleDocumentsController_content_v1",
    summary: "Stream the private sale bill file",
  })
  @ApiOkResponse({
    description: "Private image bytes or a download-only PDF.",
    content: {
      "image/jpeg": { schema: { type: "string", format: "binary" } },
      "image/png": { schema: { type: "string", format: "binary" } },
      "image/webp": { schema: { type: "string", format: "binary" } },
      "application/pdf": { schema: { type: "string", format: "binary" } },
    },
  })
  async content(
    @Param("saleId") saleId: string,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.documents.getContent(saleId);
    response.setHeader("Content-Type", content.contentType);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (content.contentType === "application/pdf") {
      response.setHeader(
        "Content-Disposition",
        'attachment; filename="scooter-sale-bill.pdf"',
      );
      response.setHeader("Content-Security-Policy", "sandbox");
    }
    if (content.contentLength !== null) {
      response.setHeader("Content-Length", String(content.contentLength));
    }
    await pipeline(content.body, response);
  }
}
