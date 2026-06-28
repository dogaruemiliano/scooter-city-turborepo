import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBody,
  ApiBearerAuth,
  ApiConsumes,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { v1 } from "@repo/api-shared";
import type { Request, Response } from "express";
import { memoryStorage } from "multer";
import { pipeline } from "node:stream/promises";
import { ZodResponse } from "nestjs-zod";

import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequireRoles } from "../common/decorators/roles.decorator";
import { getRequestMetadata } from "../common/http/request-metadata";
import { CompletePersonDocumentPhotoUploadInput } from "./dto/complete-person-document-photo-upload.input";
import { CreatePersonDocumentInput } from "./dto/create-person-document.input";
import { CreatePersonDocumentPhotoUploadUrlInput } from "./dto/create-person-document-photo-upload-url.input";
import { CreatePersonInput } from "./dto/create-person.input";
import { ListPersonsQuery } from "./dto/list-persons.query";
import { Person } from "./dto/person";
import { PersonAuditEventList } from "./dto/person-audit-event-list";
import { PersonDocument } from "./dto/person-document";
import { PersonDocumentList } from "./dto/person-document-list";
import { PersonDocumentPhoto } from "./dto/person-document-photo";
import { PersonDocumentPhotoList } from "./dto/person-document-photo-list";
import { PersonDocumentPhotoReadUrl } from "./dto/person-document-photo-read-url";
import { PersonDocumentPhotoUploadUrl } from "./dto/person-document-photo-upload-url";
import { PersonList } from "./dto/person-list";
import { UpdatePersonDocumentInput } from "./dto/update-person-document.input";
import { UpdatePersonInput } from "./dto/update-person.input";
import {
  toPerson,
  toPersonDocument,
  toPersonDocumentPhoto,
} from "./persons.mapper";
import { PersonsService } from "./persons.service";

@ApiTags("persons")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "persons", version: "1" })
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  @Post()
  @ApiOperation({
    operationId: "PersonsController_create_v1",
    summary: "Create an admin-managed person record",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: Person })
  async create(
    @Body() input: CreatePersonInput,
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
  ): Promise<v1.persons.Person> {
    return toPerson(
      await this.persons.create(input, {
        actor: user,
        ...getRequestMetadata(req),
      }),
    );
  }

  @Get()
  @ApiOperation({
    operationId: "PersonsController_list_v1",
    summary: "List admin-managed person records",
  })
  @ZodResponse({ type: PersonList })
  async list(@Query() query: ListPersonsQuery): Promise<v1.persons.PersonList> {
    const result = await this.persons.list(query);
    return {
      ...result,
      items: result.items.map(toPerson),
    };
  }

  @Get(":id")
  @ApiOperation({
    operationId: "PersonsController_get_v1",
    summary: "Get one active person record",
  })
  @ZodResponse({ type: Person })
  async get(@Param("id") id: string): Promise<v1.persons.Person> {
    const row = await this.persons.findActiveById(id);
    if (!row) {
      throw new NotFoundException("Person not found");
    }
    return toPerson(row);
  }

  @Get(":id/audit-events")
  @ApiOperation({
    operationId: "PersonsController_listAuditEvents_v1",
    summary: "List audit events for one active person record",
  })
  @ZodResponse({ type: PersonAuditEventList })
  async listAuditEvents(
    @Param("id") id: string,
  ): Promise<v1.persons.PersonAuditEvent[]> {
    return this.persons.listAuditEvents(id);
  }

  @Get(":id/documents")
  @ApiOperation({
    operationId: "PersonsController_listDocuments_v1",
    summary: "List active documents for one active person record",
  })
  @ZodResponse({ type: PersonDocumentList })
  async listDocuments(
    @Param("id") id: string,
  ): Promise<v1.persons.PersonDocument[]> {
    return (await this.persons.listDocuments(id)).map(toPersonDocument);
  }

  @Post(":id/documents")
  @ApiOperation({
    operationId: "PersonsController_createDocument_v1",
    summary: "Create a document for one active person record",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: PersonDocument })
  async createDocument(
    @Param("id") id: string,
    @Body() input: CreatePersonDocumentInput,
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
  ): Promise<v1.persons.PersonDocument> {
    return toPersonDocument(
      await this.persons.createDocument(id, input, {
        actor: user,
        ...getRequestMetadata(req),
      }),
    );
  }

  @Get(":id/documents/:documentId")
  @ApiOperation({
    operationId: "PersonsController_getDocument_v1",
    summary: "Get one active document for one active person record",
  })
  @ZodResponse({ type: PersonDocument })
  async getDocument(
    @Param("id") id: string,
    @Param("documentId") documentId: string,
  ): Promise<v1.persons.PersonDocument> {
    const row = await this.persons.findActiveDocument(id, documentId);
    if (!row) {
      throw new NotFoundException("Person document not found");
    }
    return toPersonDocument(row);
  }

  @Patch(":id/documents/:documentId")
  @ApiOperation({
    operationId: "PersonsController_updateDocument_v1",
    summary: "Update one active document for one active person record",
  })
  @ZodResponse({ type: PersonDocument })
  async updateDocument(
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Body() input: UpdatePersonDocumentInput,
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
  ): Promise<v1.persons.PersonDocument> {
    return toPersonDocument(
      await this.persons.updateDocument(id, documentId, input, {
        actor: user,
        ...getRequestMetadata(req),
      }),
    );
  }

  @Post(":id/documents/:documentId/replace")
  @ApiOperation({
    operationId: "PersonsController_replaceDocument_v1",
    summary: "Replace one active document for one active person record",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: PersonDocument })
  async replaceDocument(
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Body() input: CreatePersonDocumentInput,
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
  ): Promise<v1.persons.PersonDocument> {
    return toPersonDocument(
      await this.persons.replaceDocument(id, documentId, input, {
        actor: user,
        ...getRequestMetadata(req),
      }),
    );
  }

  @Delete(":id/documents/:documentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "PersonsController_deleteDocument_v1",
    summary: "Soft-delete one active document for one active person record",
  })
  @ApiNoContentResponse()
  async deleteDocument(
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
  ): Promise<void> {
    await this.persons.softDeleteDocument(id, documentId, {
      actor: user,
      ...getRequestMetadata(req),
    });
  }

  @Get(":id/documents/:documentId/photos")
  @ApiOperation({
    operationId: "PersonsController_listDocumentPhotos_v1",
    summary: "List active photos for one active person document",
  })
  @ZodResponse({ type: PersonDocumentPhotoList })
  async listDocumentPhotos(
    @Param("id") id: string,
    @Param("documentId") documentId: string,
  ): Promise<v1.persons.PersonDocumentPhoto[]> {
    return (await this.persons.listDocumentPhotos(id, documentId)).map(
      (photo) => toPersonDocumentPhoto(photo, id),
    );
  }

  @Put(":id/documents/:documentId/photos/:slot")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
      },
    },
  })
  @ApiOperation({
    operationId: "PersonsController_upsertDocumentPhoto_v1",
    summary: "Upload or replace one active photo slot for a person document",
  })
  @ZodResponse({ type: PersonDocumentPhoto })
  async upsertDocumentPhoto(
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Param("slot") slot: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.persons.PersonDocumentPhoto> {
    if (!file) {
      throw new BadRequestException("Image file is required");
    }

    return toPersonDocumentPhoto(
      await this.persons.upsertDocumentPhoto(
        id,
        documentId,
        slot,
        file,
        user.id,
      ),
      id,
    );
  }

  @Post(":id/documents/:documentId/photos/:slot/upload-url")
  @ApiOperation({
    operationId: "PersonsController_createDocumentPhotoUploadUrl_v1",
    summary: "Create a signed S3 PUT URL for a person document photo",
  })
  @ZodResponse({ type: PersonDocumentPhotoUploadUrl })
  async createDocumentPhotoUploadUrl(
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Param("slot") slot: string,
    @Body() input: CreatePersonDocumentPhotoUploadUrlInput,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.persons.PersonDocumentPhotoUploadUrl> {
    return this.persons.createDocumentPhotoUploadUrl(
      id,
      documentId,
      slot,
      input,
      user.id,
    );
  }

  @Post(":id/documents/:documentId/photos/:slot/complete-upload")
  @ApiOperation({
    operationId: "PersonsController_completeDocumentPhotoUpload_v1",
    summary: "Complete a signed S3 PUT upload for a person document photo",
  })
  @ZodResponse({ type: PersonDocumentPhoto })
  async completeDocumentPhotoUpload(
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Param("slot") slot: string,
    @Body() input: CompletePersonDocumentPhotoUploadInput,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.persons.PersonDocumentPhoto> {
    return toPersonDocumentPhoto(
      await this.persons.completeDocumentPhotoUpload(
        id,
        documentId,
        slot,
        input,
        user.id,
      ),
      id,
    );
  }

  @Get(":id/documents/:documentId/photos/:slot/read-url")
  @ApiOperation({
    operationId: "PersonsController_getDocumentPhotoReadUrl_v1",
    summary: "Create a signed S3 GET URL for one active person document photo",
  })
  @ZodResponse({ type: PersonDocumentPhotoReadUrl })
  async getDocumentPhotoReadUrl(
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Param("slot") slot: string,
  ): Promise<v1.persons.PersonDocumentPhotoReadUrl> {
    return this.persons.getDocumentPhotoReadUrl(id, documentId, slot);
  }

  @Get(":id/documents/:documentId/photos/:slot/content")
  @ApiOperation({
    operationId: "PersonsController_getDocumentPhotoContent_v1",
    summary: "Stream one active person document photo",
  })
  @ApiOkResponse({
    description: "Private image bytes.",
    content: {
      "image/jpeg": { schema: { type: "string", format: "binary" } },
      "image/png": { schema: { type: "string", format: "binary" } },
      "image/webp": { schema: { type: "string", format: "binary" } },
    },
  })
  async getDocumentPhotoContent(
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Param("slot") slot: string,
    @Res() res: Response,
  ): Promise<void> {
    const content = await this.persons.getDocumentPhotoContent(
      id,
      documentId,
      slot,
    );

    res.setHeader("Content-Type", content.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (content.contentLength !== null) {
      res.setHeader("Content-Length", String(content.contentLength));
    }

    await pipeline(content.body, res);
  }

  @Delete(":id/documents/:documentId/photos/:slot")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "PersonsController_deleteDocumentPhoto_v1",
    summary: "Soft-delete one active person document photo slot",
  })
  @ApiNoContentResponse()
  async deleteDocumentPhoto(
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Param("slot") slot: string,
  ): Promise<void> {
    await this.persons.softDeleteDocumentPhoto(id, documentId, slot);
  }

  @Patch(":id")
  @ApiOperation({
    operationId: "PersonsController_update_v1",
    summary: "Update one active person record",
  })
  @ZodResponse({ type: Person })
  async update(
    @Param("id") id: string,
    @Body() input: UpdatePersonInput,
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
  ): Promise<v1.persons.Person> {
    return toPerson(
      await this.persons.update(id, input, {
        actor: user,
        ...getRequestMetadata(req),
      }),
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "PersonsController_delete_v1",
    summary: "Soft-delete one active person record",
  })
  @ApiNoContentResponse()
  async delete(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
  ): Promise<void> {
    await this.persons.softDelete(id, {
      actor: user,
      ...getRequestMetadata(req),
    });
  }
}
