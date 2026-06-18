import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { v1 } from "@repo/api-shared";
import { ZodResponse } from "nestjs-zod";

import { AUTH_ENABLED_METHODS } from "../../auth-method.registry";
import { Public } from "../../decorators/public.decorator";
import { EnabledAuthMethods } from "./dto/enabled-auth-methods";

@ApiTags("auth")
@Controller({ path: "auth", version: "1" })
export class AuthMethodsController {
  constructor(
    @Inject(AUTH_ENABLED_METHODS)
    private readonly methods: readonly v1.auth.AuthMethodId[],
  ) {}

  @Public()
  @Get("enabled-methods")
  @ApiOperation({
    operationId: "CoreAuthController_enabledMethods_v1",
    summary:
      "Which auth methods this API has enabled. Drives conditional UI on the web/mobile clients.",
  })
  @ZodResponse({ type: EnabledAuthMethods })
  enabledMethods(): EnabledAuthMethods {
    return {
      methods: [...this.methods],
    };
  }
}
