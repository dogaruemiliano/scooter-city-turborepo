/**
 * Provider-side identity verification surface.
 *
 * The OAuth auth-method modules (Google here, Apple in a sibling PR) do
 * NOT call provider SDKs directly. They depend on an abstract verifier
 * which is bound to a real implementation in production and to a fake
 * in tests. That lets E2E suites run without network access, without a
 * real Google ID token, and with deterministic claim payloads.
 *
 * The claim shape is intentionally narrower than Google's full
 * `TokenPayload` — we only consume what we actually use (`sub`, `email`,
 * `email_verified`, optional `name`/`picture`). Keeping the surface
 * small means the fake stays simple and the service layer doesn't
 * accidentally start consuming exotic fields without explicit intent.
 */
export interface GoogleIdTokenClaims {
  /** Stable, unique-per-Google-account identifier. The `AuthAccount.providerId`. */
  sub: string;
  /** Email the user authenticated with at the IdP. */
  email: string;
  /** True iff Google has verified the address. Controls auto-linking. */
  emailVerified: boolean;
  /** Display name, if Google sent the `profile` scope. */
  name?: string;
  /** Profile photo URL, if available. Currently unused but captured for future profile sync. */
  picture?: string;
}

/**
 * Verify a Google-issued ID token.
 *
 * Implementations MUST validate signature, expiry, and audience.
 * Anything that fails verification MUST throw `UnauthorizedException`
 * with a generic message — never leak the underlying error to the
 * client (avoids token-format fingerprinting / oracle attacks).
 *
 * Abstract class (not `interface`) so Nest's DI container can use it
 * as an injection token directly via `@Injectable()`. The
 * `provider-verification.module.ts` binds it to `RealGoogleVerifier` in
 * production; tests use `Test.createTestingModule().overrideProvider(GoogleVerifier)`.
 */
export abstract class GoogleVerifier {
  abstract verify(idToken: string): Promise<GoogleIdTokenClaims>;
}
