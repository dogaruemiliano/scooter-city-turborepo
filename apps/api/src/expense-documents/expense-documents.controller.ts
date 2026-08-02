import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import type { Response } from "express";
import { pipeline } from "node:stream/promises";
import { ZodResponse } from "nestjs-zod";

import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequireRoles } from "../common/decorators/roles.decorator";
import { CompleteExpenseDocumentUploadInput } from "./dto/complete-expense-document-upload.input";
import { CreateExpenseDocumentUploadUrlInput } from "./dto/create-expense-document-upload-url.input";
import { CreateExpenseDocumentInput } from "./dto/create-expense-document.input";
import { ExpenseDocumentList } from "./dto/expense-document-list";
import { ExpenseDocumentUploadUrl } from "./dto/expense-document-upload-url";
import { ExpenseDocument } from "./dto/expense-document";
import { UpdateExpenseDocumentInput } from "./dto/update-expense-document.input";
import { toExpenseDocument } from "./expense-document.mapper";
import { ExpenseDocumentsService } from "./expense-documents.service";

@ApiTags("expense documents")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "finance/expenses/:expenseId/documents", version: "1" })
export class ExpenseDocumentsController {
  constructor(private readonly documents: ExpenseDocumentsService) {}

  @Get()
  @ApiOperation({
    operationId: "ExpenseDocumentsController_list_v1",
    summary: "List private manual evidence for an expense",
  })
  @ZodResponse({ type: ExpenseDocumentList })
  async list(
    @Param("expenseId") expenseId: string,
  ): Promise<v1.finance.ExpenseDocumentList> {
    return {
      items: (await this.documents.list(expenseId)).map(toExpenseDocument),
    };
  }

  @Post()
  @ApiOperation({
    operationId: "ExpenseDocumentsController_create_v1",
    summary: "Create manually entered expense-document metadata",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ExpenseDocument })
  async create(
    @Param("expenseId") expenseId: string,
    @Body() input: CreateExpenseDocumentInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.ExpenseDocument> {
    return toExpenseDocument(
      await this.documents.create(expenseId, input, actor.id),
    );
  }

  @Get(":documentId")
  @ApiOperation({
    operationId: "ExpenseDocumentsController_get_v1",
    summary: "Get manual evidence metadata for an expense",
  })
  @ZodResponse({ type: ExpenseDocument })
  async get(
    @Param("expenseId") expenseId: string,
    @Param("documentId") documentId: string,
  ): Promise<v1.finance.ExpenseDocument> {
    return toExpenseDocument(await this.documents.get(expenseId, documentId));
  }

  @Patch(":documentId")
  @ApiOperation({
    operationId: "ExpenseDocumentsController_update_v1",
    summary: "Update manual metadata or review state without rewriting bytes",
  })
  @ZodResponse({ type: ExpenseDocument })
  async update(
    @Param("expenseId") expenseId: string,
    @Param("documentId") documentId: string,
    @Body() input: UpdateExpenseDocumentInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.ExpenseDocument> {
    return toExpenseDocument(
      await this.documents.update(expenseId, documentId, input, actor.id),
    );
  }

  @Delete(":documentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "ExpenseDocumentsController_delete_v1",
    summary: "Delete evidence from a draft expense",
  })
  @ApiNoContentResponse()
  async delete(
    @Param("expenseId") expenseId: string,
    @Param("documentId") documentId: string,
  ): Promise<void> {
    await this.documents.delete(expenseId, documentId);
  }

  @Post(":documentId/assets/:role/upload-url")
  @ApiOperation({
    operationId: "ExpenseDocumentsController_createUploadUrl_v1",
    summary: "Create a checksum-bound private S3 PUT URL",
  })
  @ZodResponse({ type: ExpenseDocumentUploadUrl })
  createUploadUrl(
    @Param("expenseId") expenseId: string,
    @Param("documentId") documentId: string,
    @Param("role") role: string,
    @Body() input: CreateExpenseDocumentUploadUrlInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.ExpenseDocumentUploadUrl> {
    return this.documents.createUploadUrl(
      expenseId,
      documentId,
      role,
      input,
      actor.id,
    );
  }

  @Post(":documentId/assets/:role/complete-upload")
  @ApiOperation({
    operationId: "ExpenseDocumentsController_completeUpload_v1",
    summary: "Validate and attach an immutable uploaded rendition",
  })
  @ZodResponse({ type: ExpenseDocument })
  async completeUpload(
    @Param("expenseId") expenseId: string,
    @Param("documentId") documentId: string,
    @Param("role") role: string,
    @Body() input: CompleteExpenseDocumentUploadInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.ExpenseDocument> {
    return toExpenseDocument(
      await this.documents.completeUpload(
        expenseId,
        documentId,
        role,
        input,
        actor.id,
      ),
    );
  }

  @Get(":documentId/assets/:role/content")
  @ApiOperation({
    operationId: "ExpenseDocumentsController_content_v1",
    summary: "Stream authorized private expense evidence",
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
    @Param("expenseId") expenseId: string,
    @Param("documentId") documentId: string,
    @Param("role") role: string,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.documents.getContent(
      expenseId,
      documentId,
      role,
    );
    response.setHeader("Content-Type", content.contentType);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (content.contentType === "application/pdf") {
      response.setHeader(
        "Content-Disposition",
        'attachment; filename="expense-document.pdf"',
      );
      response.setHeader("Content-Security-Policy", "sandbox");
    }
    if (content.contentLength !== null) {
      response.setHeader("Content-Length", String(content.contentLength));
    }
    await pipeline(content.body, response);
  }
}
