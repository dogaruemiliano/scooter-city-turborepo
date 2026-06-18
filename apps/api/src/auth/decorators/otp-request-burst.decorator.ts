import { applyDecorators, UseGuards } from "@nestjs/common";

import { OtpRequestBurstGuard } from "../throttling/throttler.guards";

export function OtpRequestBurst(): MethodDecorator {
  return applyDecorators(UseGuards(OtpRequestBurstGuard));
}
