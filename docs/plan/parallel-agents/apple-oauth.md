# Agent prompt — Apple OAuth module (PR 10)

> Copy everything between the fences and paste into a new Claude Code session, **with the agent spawned via `isolation: "worktree"` from `main`**. Do not run two of these against the same worktree.

---

You are implementing Sign in with Apple for `apps/api`. Read `docs/plan/parallel-agents/_shared-context.md` and `AGENTS.md` end-to-end before writing any code. Those two files define the conventions, the import patterns, the test patterns, and the file-level constraints — every rule there is binding.

## Scope

Build `AppleAuthModule`: one endpoint that exchanges an Apple-issued identity token for an API session. Apple's identity token is a JWT signed by Apple's rotating JWKS, with audience equal to your Service ID (web) or Bundle ID (iOS native).

### Endpoints

- `POST /v1/auth/apple` (public, throttled with `login-ip` bucket)
  - Body: `{ idToken, fullName? }` (`fullName` is the optional name object Apple sends only on the very first sign-in; treat it as a hint).
  - Verify the JWT using `jose` against Apple's JWKS at `https://appleid.apple.com/auth/keys`. Acceptable issuers: `https://appleid.apple.com`. Audience must be in `[env.APPLE_SERVICE_ID, env.APPLE_BUNDLE_ID]` (whichever are configured).
  - Extract claims: `sub` (per-app, stable), `email` (only present on first sign-in for that user), `email_verified` (string `"true"` / `"false"`; cast to boolean), `is_private_email` (means `@privaterelay.appleid.com`; **accept**, don't block).
  - Resolve the user:
    - If an `AuthAccount` with `(provider="apple", providerId=<sub>)` exists → that's the user. **Do not overwrite the stored `email`** (Apple may have changed the relay address; the original is the link of record).
    - Else if a `User` exists with the same email AND `email_verified=true` → auto-link: insert `AuthAccount`, capture the email on the new row, return that user. Emit `OAUTH_LINKED`.
    - Else if a `User` exists with the same email but `email_verified=false` → **409 Conflict**. Emit `LOGIN_FAIL` with reason `email-not-verified-by-provider`.
    - Else (no user exists for that email AND we have one) → create `User` with `emailVerified=now` if Apple verified, link `AuthAccount` capturing the email. Emit `SIGNUP` + `OAUTH_LINKED`.
    - Edge case: subsequent sign-in where Apple omits `email` AND no `AuthAccount` for `(apple, sub)` exists. This shouldn't happen if the first sign-in succeeded; if it does (data loss / migration), return 401 with a generic "Apple sign-in failed; please contact support" — don't try to recover.
  - Call `coreAuth.issueSession(...)`, write cookies, return `TokenPair`. Emit `LOGIN_SUCCESS`.

### Apple-specific notes

- **Email only on first sign-in.** Apple sends the `email` claim only once per `sub`. Persist it to `AuthAccount.email` on the first link; subsequent sign-ins look up the stored email by `sub`.
- **Private relay.** `@privaterelay.appleid.com` is a real, deliverable email Apple forwards. Accept it identically to any other email; don't add a domain block.
- **`sub` is per-app.** Apple's `sub` is keyed by `(team, service-id)`, so the same Apple ID has different `sub`s in different apps. Your `(provider, providerId)` unique constraint correctly captures that.
- **JWKS rotation.** Apple rotates keys; cache JWKS responses with `jose`'s `createRemoteJWKSet` (it has built-in caching with a max-age). Don't roll your own caching.
- **Clock skew.** Allow ±5 seconds in `jose`'s `jwtVerify` (`{ clockTolerance: 5 }`).

### Files to create

```
apps/api/src/auth/modules/apple/
├── apple.module.ts
├── apple.service.ts
├── apple.controller.ts
├── apple-verifier.service.ts               # owns the JWKS client + verifyAppleToken
└── dto/
    └── apple-signin.dto.ts                 # extends createZodDto(v1.auth.appleSigninSchema)

packages/api-shared/src/v1/auth/
└── apple.schemas.ts                        # appleSigninSchema (idToken + optional fullName)

apps/api/test/
├── apple-auth.e2e-spec.ts                  # all scenarios — generate test JWTs against a local JWKS or mock the verifier
└── fakes/apple-verifier.fake.ts            # if convenient

docs/auth/
└── apple-signin.md                         # Apple-specific quirks: first-login email, private relay, sub-per-app, JWKS rotation
```

(If `docs/auth/oauth-linking-rules.md` already exists when this branch lands, amend it with an Apple-specific section instead of rewriting.)

### Schemas

```ts
// packages/api-shared/src/v1/auth/apple.schemas.ts
import { z } from "zod";

const fullNameSchema = z
  .object({
    givenName: z.string().max(80).nullish(),
    familyName: z.string().max(80).nullish(),
  })
  .strict()
  .meta({ id: "AppleFullName" });

export const appleSigninSchema = z
  .object({
    idToken: z
      .string()
      .min(20)
      .describe(
        "Apple-issued identity token (JWT) from Sign in with Apple JS or the native SDK.",
      ),
    fullName: fullNameSchema
      .optional()
      .describe(
        "Optional name payload Apple sends only on the very first sign-in. Used as a hint when creating a new User.",
      ),
  })
  .strict()
  .meta({ id: "AppleSignin" });

export type AppleSigninInput = z.infer<typeof appleSigninSchema>;
```

### Audit events

Same set as Google:

- `OAUTH_LINKED` — when inserting a new `AuthAccount`. `meta: { provider: "apple" }`.
- `SIGNUP` — brand-new `User`. `meta: { method: "apple" }`.
- `LOGIN_SUCCESS` / `LOGIN_FAIL` — `meta: { method: "apple", reason? }`.

### Tests (e2e)

Use a test-only verifier-fake injected via `Test.createTestingModule().overrideProvider(AppleVerifier).useClass(FakeAppleVerifier)`. The fake lets you pre-register `(idToken → claims)` pairs or fail-by-default.

Minimum coverage:

1. New user, first sign-in: Apple sends `email` + `email_verified=true`. 200 with `TokenPair`. `User` created with `emailVerified=now`, `AuthAccount` row with `email` populated. Audit: `SIGNUP` + `OAUTH_LINKED` + `LOGIN_SUCCESS`.
2. Second sign-in (same `sub`, Apple omits `email`): 200, no new rows, no audit `OAUTH_LINKED`. The stored `email` is unchanged. Audit: `LOGIN_SUCCESS`.
3. Private relay email accepted: claim is `xyz@privaterelay.appleid.com`, verified. 200.
4. Existing user with same email, no `AuthAccount`, `email_verified=true` → auto-link. Audit: `OAUTH_LINKED` + `LOGIN_SUCCESS`.
5. Existing user with same email, no `AuthAccount`, `email_verified=false` → 409. Audit: `LOGIN_FAIL`.
6. Verifier rejects (signature, audience, or expiry failure) → 401. Audit: `LOGIN_FAIL` with reason `verifier-rejected`.
7. Cookies are set on success.
8. The endpoint refuses anything other than `{ idToken, fullName? }` (extra keys → 400).

### Module wiring

```ts
@Module({
  imports: [UsersModule],
  controllers: [AppleAuthController],
  providers: [
    AppleAuthService,
    { provide: AppleVerifier, useClass: RealAppleVerifier },
  ],
})
export class AppleAuthModule {}
```

Inject `CoreAuthService`, `PrismaService`, `AuditService`, `@Inject(ENV) env`, and the `AppleVerifier`.

### Env

`APPLE_SERVICE_ID`, `APPLE_BUNDLE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID` are already defined in [`env.ts`](../../../apps/api/src/config/env.ts) with the cross-field rule "at least one of `APPLE_SERVICE_ID` or `APPLE_BUNDLE_ID` is required when `AUTH_APPLE_ENABLED=true`". Just consume them — do not modify the env schema.

### Library to install

```bash
cd apps/api && pnpm add jose
```

### Doc to write — `docs/auth/apple-signin.md`

Cover: JWKS verification (URL, caching via `createRemoteJWKSet`, clock skew tolerance), Apple-specific claims (`sub` per-app, `email` first-login only, `is_private_email`, `email_verified` as string), the `fullName` payload, why we don't update the stored email on subsequent logins, audience configuration (`APPLE_SERVICE_ID` vs `APPLE_BUNDLE_ID`). If `docs/auth/oauth-linking-rules.md` exists, link to its sections instead of duplicating them.

## Allowed shared-file edits (mention each in `[INTEGRATION]`)

- `packages/api-shared/src/v1/auth/index.ts` — `export * from "./apple.schemas";`
- `apps/api/src/auth/auth.module.ts` — note the line PR 6 will need: `if (env.AUTH_APPLE_ENABLED) imports.push(AppleAuthModule);`
- `apps/api/src/audit/audit.types.ts` — only if you added a new type (unlikely).
- `CHANGELOG.md` — append "Added — PR 10 (Sign in with Apple)" under "Unreleased".

## Definition of done

- [ ] All files listed above created.
- [ ] `pnpm --filter @repo/api-shared build` succeeds.
- [ ] `pnpm --filter api check-types` clean.
- [ ] `pnpm --filter api test` and `pnpm --filter api test:e2e` both pass.
- [ ] `pnpm gen` succeeds and `openapi.json` contains an `AppleSignin` schema.
- [ ] Final message includes the `[INTEGRATION]` block.
- [ ] Branch committed with `feat(auth/apple): ...`.

If you get stuck, ask the user — don't guess. Don't reduce scope without explicit approval.
