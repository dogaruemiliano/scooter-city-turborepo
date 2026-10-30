import { Body, Controller, Delete, Get, Param, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { RequireAllScope } from "../access/access.decorators";
import { ScooterInsuranceService } from "./scooter-insurance.service";

class InsuranceInput extends createZodDto(
  v1.scooters.scooterInsuranceSaveSchema,
) {}
class InsuranceDelete extends createZodDto(
  v1.scooters.scooterInsuranceDeleteSchema,
) {}
class InsuranceList extends createZodDto(
  v1.scooters.scooterInsuranceListSchema,
) {}

@ApiTags("scooters")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "scooters/:id/insurance", version: "1" })
export class ScooterInsuranceController {
  constructor(private readonly insurance: ScooterInsuranceService) {}
  @Get()
  @RequireAllScope("scooters.read", "scooter_documents.read")
  @ZodResponse({ type: InsuranceList })
  list(@Param("id") id: string) {
    return this.insurance.list(id);
  }
  @Delete(":policyId")
  @RequireAllScope(
    "scooters.update",
    "scooter_documents.write",
    "scooter_documents.read",
  )
  @ZodResponse({ type: InsuranceList })
  delete(
    @Param("id") id: string,
    @Param("policyId") policyId: string,
    @Body() input: InsuranceDelete,
  ) {
    return this.insurance.delete(id, policyId, input.expectedUpdatedAt);
  }
  @Patch()
  @RequireAllScope(
    "scooters.update",
    "scooter_documents.write",
    "scooter_documents.read",
  )
  @ZodResponse({ type: InsuranceList })
  update(@Param("id") id: string, @Body() input: InsuranceInput) {
    return this.insurance.update(id, input);
  }
}
