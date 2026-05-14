/**
 * Sign-in-with-Apple module.
 *
 * Owns the `POST /v1/auth/apple` endpoint: verify an Apple-issued
 * identity token, resolve or create the matching `User`, link an
 * `AuthAccount(provider="apple")` on first sign-in, and issue an API
 * session via `CoreAuthService`.
 *
 * Loaded conditionally by `AuthModule.forRoot()` when
 * `AUTH_APPLE_ENABLED=true`. When disabled the route doesn't exist
 * (404) and the providers aren't registered — see the integration note
 * at the bottom of this PR's `[INTEGRATION]` block.
 *
 * Submodules of `AuthModule` re-import shared modules (`UsersModule`,
 * `JwtModule`) locally; Nest deduplicates the registrations so there's
 * still only one instance of each underlying service. Do NOT mark
 * anything `@Global()` to "solve sharing" — see [AGENTS.md].
 */
import { Module } from "@nestjs/common";

import { UsersModule } from "../../../users/users.module";
import { CoreAuthModule } from "../core-auth/core-auth.module";

import { AppleAuthController } from "./apple.controller";
import { AppleAuthService } from "./apple.service";
import { AppleVerifier, RealAppleVerifier } from "./apple-verifier.service";

@Module({
  imports: [UsersModule, CoreAuthModule],
  controllers: [AppleAuthController],
  providers: [
    AppleAuthService,
    { provide: AppleVerifier, useClass: RealAppleVerifier },
  ],
})
export class AppleAuthModule {}
