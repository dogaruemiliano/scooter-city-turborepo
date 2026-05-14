/**
 * Test-only implementation of {@link GoogleVerifier}.
 *
 * The verifier is the only piece of the Google sign-in flow that reaches
 * the network. Replacing it in tests gives us deterministic claim
 * payloads, no Google client IDs in CI, and instant verification.
 *
 * Usage in an E2E suite:
 *
 * ```ts
 * const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
 *   .overrideProvider(GoogleVerifier)
 *   .useClass(FakeGoogleVerifier)
 *   .compile();
 *
 * const verifier = app.get(GoogleVerifier) as FakeGoogleVerifier;
 * verifier.register("token-abc", { sub: "g-1", email: "a@x", emailVerified: true });
 * ```
 *
 * The fake is **fail-by-default**: an unregistered token raises the
 * same `UnauthorizedException` shape the real verifier would. Tests
 * register tokens they expect to succeed, and tokens they want to fail
 * are simply omitted (or registered via `failNext()`).
 */
import { Injectable, UnauthorizedException } from "@nestjs/common";

import {
  GoogleIdTokenClaims,
  GoogleVerifier,
} from "./google-verifier.interface";

@Injectable()
export class FakeGoogleVerifier extends GoogleVerifier {
  private readonly tokens = new Map<string, GoogleIdTokenClaims>();
  /** Set of tokens that should explicitly reject (overrides the map). */
  private readonly rejects = new Set<string>();

  /** Pre-register a token → claims mapping. */
  register(idToken: string, claims: GoogleIdTokenClaims): void {
    this.tokens.set(idToken, claims);
  }

  /** Mark a token as one that must fail verification. */
  fail(idToken: string): void {
    this.rejects.add(idToken);
  }

  /** Clear everything — call in `afterEach` to keep tests independent. */
  reset(): void {
    this.tokens.clear();
    this.rejects.clear();
  }

  verify(idToken: string): Promise<GoogleIdTokenClaims> {
    if (this.rejects.has(idToken)) {
      return Promise.reject(
        new UnauthorizedException("Invalid Google ID token"),
      );
    }
    const claims = this.tokens.get(idToken);
    if (!claims) {
      return Promise.reject(
        new UnauthorizedException("Invalid Google ID token"),
      );
    }
    return Promise.resolve(claims);
  }
}
