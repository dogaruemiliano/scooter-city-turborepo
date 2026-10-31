import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCookieAuth,
  ApiTags,
} from "@nestjs/swagger";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { v1 } from "@repo/api-shared";
import type { Response } from "express";
import {
  RequireAllScope,
  RequireAnyAllScope,
} from "../access/access.decorators";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthPrincipal } from "../auth/auth.types";
import { RentalMediaService } from "./rental-media.service";

class MediaQuery extends createZodDto(v1.rentals.rentalMediaQuerySchema) {}
class UploadInput extends createZodDto(
  v1.rentals.rentalMediaUploadInputSchema,
) {}
class Media extends createZodDto(v1.rentals.rentalMediaSchema) {}
class MediaList extends createZodDto(v1.rentals.rentalMediaListSchema) {}

@ApiTags("rentals")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "rentals/:id/media", version: "1" })
export class RentalMediaController {
  constructor(readonly media: RentalMediaService) {}
  @Get()
  @RequireAllScope("rentals.read")
  @Header("Cache-Control", "private, no-store")
  @ZodResponse({ type: MediaList })
  list(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Query() query: MediaQuery,
  ) {
    return this.media.list(user.id, id, query.eventType);
  }

  @Post()
  @ApiConsumes("multipart/form-data")
  @RequireAnyAllScope("rentals.handover", "rentals.return")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 1 },
    }),
  )
  @ZodResponse({ status: 201, type: Media })
  upload(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: UploadInput,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.media.upload(user.id, id, input.eventType, file);
  }

  @Get(":mediaId/content")
  @RequireAllScope("rentals.read")
  async content(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Param("mediaId") mediaId: string,
    @Res() response: Response,
  ) {
    const result = await this.media.content(user.id, id, mediaId);
    response
      .set({
        "Content-Type": result.contentType,
        "Content-Length": String(result.buffer.length),
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      })
      .send(result.buffer);
  }
}
