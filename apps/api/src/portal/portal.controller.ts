import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { createZodDto, ZodResponse } from "nestjs-zod";
import type { Response } from "express";
import { pipeline } from "node:stream/promises";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../access/access.decorators";
import { PortalService } from "./portal.service";

class Profile extends createZodDto(v1.rentals.customerProfileSchema) {}
class Rental extends createZodDto(v1.rentals.customerRentalSchema) {}
class RentalList extends createZodDto(v1.rentals.customerRentalListSchema) {}
class ListQuery extends createZodDto(v1.rentals.listRentalsQuerySchema) {}
class DocumentList extends createZodDto(
  v1.rentals.customerDocumentListSchema,
) {}

@ApiTags("portal")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "portal", version: "1" })
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get("me")
  @RequirePermissions("portal.profile.read")
  @ZodResponse({ type: Profile })
  me(@CurrentUser() user: AuthPrincipal) {
    return this.portal.me(user.id);
  }

  @Get("rentals")
  @RequirePermissions("portal.rentals.read")
  @ZodResponse({ type: RentalList })
  rentals(@CurrentUser() user: AuthPrincipal, @Query() query: ListQuery) {
    return this.portal.rentals(user.id, query);
  }

  @Get("rentals/:id")
  @RequirePermissions("portal.rentals.read")
  @ZodResponse({ type: Rental })
  rental(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    return this.portal.rental(user.id, id);
  }

  @Get("rentals/:id/scooter-documents")
  @RequirePermissions("portal.scooter_documents.read")
  @ZodResponse({ type: DocumentList })
  documents(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    return this.portal.documents(user.id, id);
  }

  @Get("rentals/:id/scooter-documents/:documentId/content")
  @RequirePermissions("portal.scooter_documents.read")
  async content(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Res() res: Response,
  ) {
    const content = await this.portal.content(user.id, id, documentId);
    res.setHeader("Content-Type", content.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    if (content.contentLength !== null)
      res.setHeader("Content-Length", String(content.contentLength));
    await pipeline(content.body, res);
  }
}
