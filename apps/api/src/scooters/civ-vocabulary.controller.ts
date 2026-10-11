import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { v1 } from "@repo/api-shared";
import { RequireRoles } from "../common/decorators/roles.decorator";
import { CivVocabularyService } from "./civ-vocabulary.service";
class CivVocabulary extends createZodDto(v1.vehicleCiv.civVocabularySchema) {}

@ApiTags("vehicle-civ")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "vehicle-civ", version: "1" })
export class CivVocabularyController {
  constructor(private readonly vocabulary: CivVocabularyService) {}
  @Get("vocabulary")
  @ZodResponse({ type: CivVocabulary })
  list() {
    return this.vocabulary.list();
  }
}
