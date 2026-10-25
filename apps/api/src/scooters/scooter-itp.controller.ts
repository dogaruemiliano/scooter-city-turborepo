import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { RequireAllScope } from "../access/access.decorators";
import { ScooterItpService } from "./scooter-itp.service";

class ScooterItpInput extends createZodDto(v1.scooters.scooterItpInputSchema) {}
class ScooterItpInspection extends createZodDto(
  v1.scooters.scooterItpInspectionSchema,
) {}
class ScooterItpList extends createZodDto(v1.scooters.scooterItpListSchema) {}

@ApiTags("scooters")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "scooters/:id/itp", version: "1" })
export class ScooterItpController {
  constructor(private readonly inspections: ScooterItpService) {}

  @Get()
  @RequireAllScope("scooters.read", "scooter_documents.read")
  @ZodResponse({ type: ScooterItpList })
  list(@Param("id") id: string) {
    return this.inspections.list(id);
  }

  @Post()
  @RequireAllScope("scooters.update", "scooter_documents.read")
  @ZodResponse({ status: 201, type: ScooterItpInspection })
  create(@Param("id") id: string, @Body() input: ScooterItpInput) {
    return this.inspections.create(id, input);
  }
}
