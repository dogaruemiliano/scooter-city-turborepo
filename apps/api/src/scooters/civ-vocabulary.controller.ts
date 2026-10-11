import { RequireAllScope } from "../access/access.decorators";
import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { v1 } from "@repo/api-shared";
import { CivVocabularyService } from "./civ-vocabulary.service";
class CivVocabulary extends createZodDto(v1.vehicleCiv.civVocabularySchema) {}

@ApiTags("vehicle-civ")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "vehicle-civ", version: "1" })
export class CivVocabularyController {
  constructor(private readonly vocabulary: CivVocabularyService) {}
  @RequireAllScope("vehicle_civ.read")
  @Get("vocabulary")
  @ZodResponse({ type: CivVocabulary })
  list() {
    return this.vocabulary.list();
  }
}
