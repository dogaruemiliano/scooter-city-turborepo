/**
 * The always-on auth module: `CoreAuthService` + `CoreAuthController`.
 *
 * Imports `JwtModule` locally so `CoreAuthService` can inject
 * `JwtService`. `AuthModule.forRoot()` also registers `JwtModule` at
 * the root level; Nest deduplicates the registration so there's still
 * exactly one `JwtService` instance.
 *
 * Future auth-method modules (PR 8+ email-OTP, credentials, OAuth)
 * that mint or verify JWTs directly do the same `imports: [JwtModule]`
 * in their own `@Module` decorator. Methods that only call
 * `coreAuth.issueSession(...)` (no direct JWT use) don't need this.
 *
 * `CoreAuthService` is re-exported because PR 8+ auth-method modules
 * call `coreAuth.issueSession` to mint the first token pair after a
 * successful authentication.
 */
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { UsersModule } from "../../../users/users.module";

import { CoreAuthController } from "./core-auth.controller";
import { CoreAuthService } from "./core-auth.service";

@Module({
  imports: [JwtModule, UsersModule],
  controllers: [CoreAuthController],
  providers: [CoreAuthService],
  exports: [CoreAuthService],
})
export class CoreAuthModule {}
