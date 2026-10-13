import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { v1 } from "@repo/api-shared";
import type { Response } from "express";
import { pipeline } from "node:stream/promises";
import { RequireAllScope } from "../access/access.decorators";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthPrincipal } from "../auth/auth.types";
import { ScooterPhotosService } from "./scooter-photos.service";

class CreateUpload extends createZodDto(
  v1.scooters.createScooterPhotoUploadSchema,
) {}
class Upload extends createZodDto(v1.scooters.scooterPhotoUploadSchema) {}
class AttachPhoto extends createZodDto(v1.scooters.attachScooterPhotoSchema) {}
class UpdatePhoto extends createZodDto(v1.scooters.updateScooterPhotoSchema) {}
class ReorderPhotos extends createZodDto(
  v1.scooters.reorderScooterPhotosSchema,
) {}
class Photo extends createZodDto(v1.scooters.scooterPhotoSchema) {}

@ApiTags("scooters")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "scooters/:id/photos", version: "1" })
export class ScooterPhotosController {
  constructor(private readonly photos: ScooterPhotosService) {}

  @Get()
  @RequireAllScope("scooters.read")
  @ZodResponse({ type: [Photo] })
  list(@Param("id") id: string) {
    return this.photos.list(id);
  }

  @Post("upload-url")
  @RequireAllScope("scooters.update")
  @ZodResponse({ status: 201, type: Upload })
  createUpload(
    @Param("id") id: string,
    @Body() input: CreateUpload,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.photos.createUpload(id, input, user.id);
  }

  @Post()
  @RequireAllScope("scooters.update")
  @ZodResponse({ status: 201, type: [Photo] })
  attach(
    @Param("id") id: string,
    @Body() input: AttachPhoto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.photos.attach(id, input, user.id);
  }

  @Patch("reorder")
  @RequireAllScope("scooters.update")
  @ZodResponse({ type: [Photo] })
  reorder(@Param("id") id: string, @Body() input: ReorderPhotos) {
    return this.photos.reorder(id, input.photoIds);
  }

  @Patch(":photoId")
  @RequireAllScope("scooters.update")
  @ZodResponse({ type: [Photo] })
  update(
    @Param("id") id: string,
    @Param("photoId") photoId: string,
    @Body() input: UpdatePhoto,
  ) {
    return this.photos.update(id, photoId, input);
  }

  @Delete(":photoId")
  @RequireAllScope("scooters.update")
  @ZodResponse({ type: [Photo] })
  remove(@Param("id") id: string, @Param("photoId") photoId: string) {
    return this.photos.remove(id, photoId);
  }

  @Get(":photoId/content")
  @RequireAllScope("scooters.read")
  async content(
    @Param("id") id: string,
    @Param("photoId") photoId: string,
    @Res() res: Response,
  ) {
    const content = await this.photos.content(id, photoId);
    res.setHeader("Content-Type", content.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (content.contentLength !== null)
      res.setHeader("Content-Length", String(content.contentLength));
    await pipeline(content.body, res);
  }
}

@ApiTags("scooters")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "scooters", version: "1" })
export class ScooterPhotoDraftsController {
  constructor(private readonly photos: ScooterPhotosService) {}

  @Post("photo-draft-upload-url")
  @RequireAllScope("scooters.create")
  @ZodResponse({ status: 201, type: Upload })
  createUpload(
    @Body() input: CreateUpload,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.photos.createDraftUpload(input, user.id);
  }
}
