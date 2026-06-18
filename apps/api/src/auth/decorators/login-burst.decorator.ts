import { applyDecorators, UseGuards } from "@nestjs/common";

import { LoginBurstGuard } from "../throttling/throttler.guards";

export function LoginBurst(): MethodDecorator {
  return applyDecorators(UseGuards(LoginBurstGuard));
}
