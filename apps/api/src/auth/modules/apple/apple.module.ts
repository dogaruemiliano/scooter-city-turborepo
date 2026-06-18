/**
 * Sign-in-with-Apple module.
 *
 * Owns the `POST /v1/auth/apple` endpoint: verify an Apple-issued
 * identity token, resolve or create the matching `User`, link an
 * `AuthAccount(provider="apple")` on first successful link, and issue an API
 * session via `CoreAuthService`.
 *
 * Loaded conditionally by `AuthModule.forRoot()` when
 * `AUTH_APPLE_ENABLED=true`. When disabled the route doesn't exist
 * (404) and the providers aren't registered — see the integration note
 * at the bottom of this PR's `[INTEGRATION]` block.
 *
 * Database identity resolution and session issuance come from
 * `CoreAuthModule`; Apple-specific verification and audit policy remain
 * local to this module.
 */
import { Module } from "@nestjs/common";

import { CoreAuthModule } from "../core-auth/core-auth.module";
import { OAuthEmailVerificationModule } from "../oauth-email-verification/oauth-email-verification.module";

import { AppleAuthController } from "./apple.controller";
import { AppleAuthService } from "./apple.service";
import { AppleVerifier, RealAppleVerifier } from "./apple-verifier.service";

@Module({
  imports: [CoreAuthModule, OAuthEmailVerificationModule],
  controllers: [AppleAuthController],
  providers: [
    AppleAuthService,
    { provide: AppleVerifier, useClass: RealAppleVerifier },
  ],
})
export class AppleAuthModule {}
