# Agent prompt — Google OAuth module (PR 9)

> Copy everything between the fences and paste into a new Claude Code session, **with the agent spawned via `isolation: "worktree"` from `main`**. Do not run two of these against the same worktree.

---

You are implementing the Google Sign-in auth method for `apps/api`. Read `docs/plan/parallel-agents/_shared-context.md` and `AGENTS.md` end-to-end before writing any code. Those two files define the conventions, the import patterns, the test patterns, and the file-level constraints — every rule there is binding.

## Scope

Build `GoogleAuthModule`: one endpoint that exchanges a Google-issued ID token for an API session, plus the `ProviderVerificationModule` infrastructure (verifier interface + Google implementation + fake for tests).

### Endpoints

- `POST /v1/auth/google` (public, throttled with `login-ip` bucket)
  - Body: `{ idToken }` (the JWT from Google Identity Services / mobile SDK).
  - Verify the token via `google-auth-library` against the configured `GOOGLE_CLIENT_ID_WEB | _IOS | _ANDROID` audiences.
  - Resolve the user:
    - If an `AuthAccount` with `(provider="google", providerId=<sub>)` exists → that's your user. Update `email` if Google's email differs.
    - Else if a `User` exists with the same email AND Google asserts `email_verified=true` → auto-link: insert an `AuthAccount` row, return that user. Emit `OAUTH_LINKED` audit.
    - Else if a `User` exists with the same email but Google did **not** verify the email → **409 Conflict** with a message instructing the user to log in another way and link from settings. Emit `LOGIN_FAIL` with reason `email-not-verified-by-provider`.
    - Else → create a new `User` (with `emailVerified=now` if Google verified it) + `AuthAccount`. Emit `SIGNUP` + `OAUTH_LINKED`.
  - Call `coreAuth.issueSession(...)`, write cookies, return `TokenPair`. Emit `LOGIN_SUCCESS`.

### `ProviderVerificationModule`

A small module that owns the verifier interface and the concrete implementations, so tests can swap in a fake without monkey-patching.

```ts
// apps/api/src/auth/modules/provider-verification/provider-verifier.interface.ts
export interface GoogleIdTokenClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export abstract class GoogleVerifier {
  abstract verify(idToken: string): Promise<GoogleIdTokenClaims>;
}
```

- **Real implementation** `RealGoogleVerifier` uses `google-auth-library`'s `OAuth2Client.verifyIdToken({ idToken, audience: [WEB, IOS, ANDROID].filter(Boolean) })`. Throws `UnauthorizedException("Invalid Google ID token")` on any failure.
- **Fake implementation** `FakeGoogleVerifier` (test-only) lets tests pre-register `(idToken → claims)` mappings or fail-by-default.

The module binds `GoogleVerifier` to `RealGoogleVerifier` in production. Tests override via `Test.createTestingModule().overrideProvider(GoogleVerifier).useClass(FakeGoogleVerifier)`.

### Files to create

```
apps/api/src/auth/modules/google/
├── google.module.ts
├── google.service.ts
├── google.controller.ts
└── dto/
    └── google-signin.dto.ts                # extends createZodDto(v1.auth.googleSigninSchema)

apps/api/src/auth/modules/provider-verification/
├── provider-verification.module.ts
├── google-verifier.interface.ts            # abstract class + claims type
├── real-google-verifier.service.ts
└── fake-google-verifier.service.ts         # exported for tests

packages/api-shared/src/v1/auth/
└── google.schemas.ts                       # googleSigninSchema

apps/api/test/
├── google-auth.e2e-spec.ts                 # all scenarios with fake verifier injected
└── fakes/google-verifier.fake.ts           # helper if convenient

docs/auth/
└── oauth-linking-rules.md                  # when we auto-link, when we 409, Apple email-on-first-login note
```

### Schemas

```ts
// packages/api-shared/src/v1/auth/google.schemas.ts
import { z } from "zod";

export const googleSigninSchema = z
  .object({
    idToken: z
      .string()
      .min(20)
      .describe(
        "Google-issued ID token (JWT) from Google Identity Services or the native SDK.",
      ),
  })
  .strict()
  .meta({ id: "GoogleSignin" });

export type GoogleSigninInput = z.infer<typeof googleSigninSchema>;
```

### Audit events

- `OAUTH_LINKED` — every time you insert a new `AuthAccount` row. `meta: { provider: "google" }`.
- `SIGNUP` — when you create a brand-new `User`. `meta: { method: "google" }`.
- `LOGIN_SUCCESS` — on every happy-path completion. `meta: { method: "google" }`.
- `LOGIN_FAIL` — token verification failure OR email-not-verified-by-provider OR audience mismatch. `meta: { method: "google", reason }`.

If you need new event types, append to [`apps/api/src/audit/audit.types.ts`](../../../apps/api/src/audit/audit.types.ts) and flag in `[INTEGRATION]`.

### Tests (e2e, with `FakeGoogleVerifier` injected)

Minimum coverage:

1. New user, Google verified email: 200 with `TokenPair`. `User` created, `emailVerified` set, `AuthAccount` linked. Audit: `SIGNUP` + `OAUTH_LINKED` + `LOGIN_SUCCESS`.
2. Existing user with prior Google `AuthAccount`: 200, no new `AuthAccount` row, audit emits `LOGIN_SUCCESS` only.
3. Existing user with same email, no `AuthAccount`, Google `email_verified=true` → auto-link succeeds. Audit: `OAUTH_LINKED` + `LOGIN_SUCCESS`.
4. Existing user with same email, no `AuthAccount`, Google `email_verified=false` → **409**. Audit: `LOGIN_FAIL` with reason `email-not-verified-by-provider`. No `AuthAccount` row inserted.
5. Fake verifier configured to throw → **401** with generic "invalid Google ID token". Audit: `LOGIN_FAIL` with reason `verifier-rejected`.
6. Cookies are set on success.
7. The endpoint refuses anything other than `{ idToken }` (extra keys → 400 from the strict schema).

### Module wiring

```ts
// google.module.ts
@Module({
  imports: [UsersModule, ProviderVerificationModule],
  controllers: [GoogleAuthController],
  providers: [GoogleAuthService],
})
export class GoogleAuthModule {}

// provider-verification.module.ts
@Module({
  providers: [{ provide: GoogleVerifier, useClass: RealGoogleVerifier }],
  exports: [GoogleVerifier],
})
export class ProviderVerificationModule {}
```

Inject `CoreAuthService`, `PrismaService`, `AuditService`, `@Inject(ENV) env`, and the `GoogleVerifier`. No direct `JwtService` usage in this module — Google's library handles its own verification.

### Env

`GOOGLE_CLIENT_ID_WEB`, `GOOGLE_CLIENT_ID_IOS`, `GOOGLE_CLIENT_ID_ANDROID` are already defined in [`env.ts`](../../../apps/api/src/config/env.ts) with the cross-field rule "at least one is required when `AUTH_GOOGLE_ENABLED=true`". Just consume them — do not modify the env schema.

### Library to install

```bash
cd apps/api && pnpm add google-auth-library
```

### Doc to write — `docs/auth/oauth-linking-rules.md`

Cover the linking rules (when we auto-link, when we 409, the per-provider quirks). Also include the Apple email-on-first-login note even though Apple is implemented by another agent — the Apple agent owns its own implementation but this doc is the cross-provider summary. Note the open question and let the Apple agent's PR amend the doc.

## Allowed shared-file edits (mention each in `[INTEGRATION]`)

- `packages/api-shared/src/v1/auth/index.ts` — `export * from "./google.schemas";`
- `apps/api/src/auth/auth.module.ts` — note the line PR 6 will need: `if (env.AUTH_GOOGLE_ENABLED) imports.push(GoogleAuthModule);`
- `apps/api/src/audit/audit.types.ts` — only if you added a new type (unlikely).
- `CHANGELOG.md` — append "Added — PR 9 (Google OAuth + ProviderVerificationModule)" under "Unreleased".

## Definition of done

- [ ] All files listed above created.
- [ ] `pnpm --filter @repo/api-shared build` succeeds.
- [ ] `pnpm --filter api check-types` clean.
- [ ] `pnpm --filter api test` and `pnpm --filter api test:e2e` both pass.
- [ ] `pnpm gen` succeeds and `openapi.json` contains a `GoogleSignin` schema.
- [ ] Final message includes the `[INTEGRATION]` block.
- [ ] Branch committed with `feat(auth/google): ...`.

If you get stuck, ask the user — don't guess. Don't reduce scope without explicit approval.
