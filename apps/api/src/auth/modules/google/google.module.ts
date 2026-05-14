/**
 * Google Sign-in auth-method module.
 *
 * Conditionally imported by `AuthModule.forRoot()` when
 * `AUTH_GOOGLE_ENABLED=true`. Wires:
 *
 *   - `GoogleAuthController` at `POST /v1/auth/google`
 *   - `GoogleAuthService` (user resolution + linking transaction)
 *   - The `GoogleVerifier` binding — abstract token, bound here to the
 *     production `RealGoogleVerifier`. Tests override the binding via
 *     `Test.createTestingModule().overrideProvider(GoogleVerifier).useClass(FakeGoogleVerifier)`.
 *   - `UsersModule` for `UsersService` (read-only; user mutations live
 *     inside `GoogleAuthService`'s transaction).
 *   - `CoreAuthModule` for `CoreAuthService.issueSession(...)`. Nest
 *     deduplicates the registration — the same instance is shared with
 *     the root-level import.
 *
 * No direct `JwtModule` import: Google's ID token is verified by
 * `google-auth-library` against Google's public certs, not by our
 * `JwtService`. The first-party tokens are minted by `CoreAuthService`,
 * which has `JwtService` injected from its own module graph.
 */
import { Module } from "@nestjs/common";

import { UsersModule } from "../../../users/users.module";
import { CoreAuthModule } from "../core-auth/core-auth.module";

import { GoogleVerifier } from "./google-verifier.interface";
import { GoogleAuthController } from "./google.controller";
import { GoogleAuthService } from "./google.service";
import { RealGoogleVerifier } from "./real-google-verifier.service";

@Module({
  imports: [UsersModule, CoreAuthModule],
  controllers: [GoogleAuthController],
  providers: [
    GoogleAuthService,
    { provide: GoogleVerifier, useClass: RealGoogleVerifier },
  ],
})
export class GoogleAuthModule {}
