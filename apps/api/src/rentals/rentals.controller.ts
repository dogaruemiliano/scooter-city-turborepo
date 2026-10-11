import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { createZodDto, ZodResponse } from "nestjs-zod";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../access/access.decorators";
import { RentalsService } from "./rentals.service";

class CreateInput extends createZodDto(v1.rentals.createRentalInputSchema) {}
class TransitionInput extends createZodDto(
  v1.rentals.rentalTransitionInputSchema,
) {}
class ListQuery extends createZodDto(v1.rentals.listRentalsQuerySchema) {}
class Rental extends createZodDto(v1.rentals.rentalSchema) {}
class RentalList extends createZodDto(v1.rentals.rentalListSchema) {}
class VisibilityInput extends createZodDto(
  v1.rentals.documentVisibilityInputSchema,
) {}

@ApiTags("rentals")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "rentals", version: "1" })
export class RentalsController {
  constructor(private readonly rentals: RentalsService) {}
  @Get()
  @RequirePermissions("rentals.read")
  @ZodResponse({ type: RentalList })
  list(@CurrentUser() user: AuthPrincipal, @Query() query: ListQuery) {
    return this.rentals.list(user.id, query);
  }

  @Get("scooters/:id/documents")
  @RequirePermissions("scooter_documents.read")
  documents(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    return this.rentals.documents(user.id, id);
  }

  @Patch("scooter-documents/:id/visibility")
  @RequirePermissions("scooter_documents.write")
  visibility(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: VisibilityInput,
  ) {
    return this.rentals.visibility(user.id, id, input.customerVisible);
  }

  @Get(":id")
  @RequirePermissions("rentals.read")
  @ZodResponse({ type: Rental })
  get(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    return this.rentals.get(user.id, id);
  }

  @Post()
  @RequirePermissions("rentals.create")
  @ZodResponse({ status: 201, type: Rental })
  create(@CurrentUser() user: AuthPrincipal, @Body() input: CreateInput) {
    return this.rentals.create(user.id, input);
  }

  @Post(":id/handover")
  @RequirePermissions("rentals.handover")
  @ZodResponse({ status: 201, type: Rental })
  handover(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: TransitionInput,
  ) {
    return this.rentals.transition(user.id, id, input.revision, "handover");
  }

  @Post(":id/return")
  @RequirePermissions("rentals.return")
  @ZodResponse({ status: 201, type: Rental })
  returnRental(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: TransitionInput,
  ) {
    return this.rentals.transition(user.id, id, input.revision, "return");
  }

  @Post(":id/cancel")
  @RequirePermissions("rentals.create")
  @ZodResponse({ status: 201, type: Rental })
  cancel(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: TransitionInput,
  ) {
    return this.rentals.transition(user.id, id, input.revision, "cancel");
  }
}
