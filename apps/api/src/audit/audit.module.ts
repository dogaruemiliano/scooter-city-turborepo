/**
 * Global module exposing `AuditService`. Auth submodules in PR 5+ inject
 * it to record `LOGIN_SUCCESS`, `LOGIN_FAIL`, `PASSWORD_CHANGED`, etc.
 *
 * `@Global()` because audit is genuinely cross-cutting — every auth flow
 * emits events.
 */
import { Global, Module } from "@nestjs/common";

import { AuditService } from "./audit.service";

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
