import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { v1 } from "@repo/api-shared";
import { createZodDto, ZodResponse } from "nestjs-zod";
import type { Request, Response } from "express";
import { pipeline } from "node:stream/promises";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequireRoles } from "../common/decorators/roles.decorator";
import { ScooterDocumentsService } from "./scooter-documents.service";
import { ScooterDocumentAnalysisService } from "./scooter-document-analysis.service";

class AnalyzeScooterDocumentInput extends createZodDto(
  v1.scooters.analyzeScooterDocumentInputSchema,
) {}
class ScooterDocumentAnalysis extends createZodDto(
  v1.scooters.scooterDocumentAnalysisSchema,
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
@RequireRoles("ADMIN")
@Controller({ path: "scooters", version: "1" })
export class ScooterDocumentsController {
  constructor(
    private readonly documents: ScooterDocumentsService,
    private readonly analysis: ScooterDocumentAnalysisService,
  ) {}

  @Post("document-extraction")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    operationId: "ScooterDocumentsController_analyzeDocument_v1",
    summary:
      "Extract suggested scooter fields from one owned document for review",
  })
  @ZodResponse({ status: HttpStatus.OK, type: ScooterDocumentAnalysis })
  async analyzeDocument(
    @Body() input: AnalyzeScooterDocumentInput,
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const close = () => {
      if (!res.writableEnded) abort();
    };
    req.once("aborted", abort);
    res.once("close", close);
    try {
      if (req.aborted) abort();
      return await this.analysis.analyze(input, user.id, controller.signal);
    } finally {
      req.removeListener("aborted", abort);
      res.removeListener("close", close);
    }
  }

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
