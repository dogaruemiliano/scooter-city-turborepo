# OAuth account linking rules

Cross-provider summary of how a Google or Apple sign-in resolves to a local user — when we link silently, when we refuse, when we create a fresh account. Per-provider quirks live at the bottom.

## The four cases

Both `POST /v1/auth/google` and (the upcoming) `POST /v1/auth/apple` follow the same decision tree after the provider's ID token has been verified. The verification layer (`RealGoogleVerifier`, `RealAppleVerifier`) is responsible for checking signature, expiry, and audience — those failures collapse to **401** with audit `LOGIN_FAIL { reason: "verifier-rejected" }` and never reach this logic.

```
Verified provider claims arrive: { sub, email, email_verified, … }
│
├── AuthAccount(provider=<p>, providerId=<sub>) exists?
│   └── Yes → Case 1: repeat login (existing user).
│
├── No matching AuthAccount. User with same email exists?
│   ├── No  → Case 4: fresh user + AuthAccount.
│   └── Yes:
│       ├── email_verified = true  → Case 2: auto-link to existing user.
│       └── email_verified = false → Case 3: 409 Conflict (refuse).
```

| #   | Match                                                                  | Action                                                                                                                                                                                                    | Audit                                                        |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | `AuthAccount(provider, providerId=<sub>)` exists                       | That row's `userId` is the user. Issue a session. Keep `AuthAccount.email` in sync with the provider's current value, but never touch `User.email`.                                                       | `LOGIN_SUCCESS` only.                                        |
| 2   | Same `email` exists, no `AuthAccount`, **provider verified** the email | Insert an `AuthAccount(provider, providerId=<sub>, userId=<existing>)`. Issue a session.                                                                                                                  | `OAUTH_LINKED` + `LOGIN_SUCCESS`.                            |
| 3   | Same `email` exists, no `AuthAccount`, provider **did not** verify it  | **409 Conflict** with `code: "EMAIL_NOT_VERIFIED_BY_PROVIDER"` and a message instructing the user to log in another way and link from settings. **No AuthAccount row is inserted.** No session is issued. | `LOGIN_FAIL { reason: "email-not-verified-by-provider" }`.   |
| 4   | No `AuthAccount`, no `User` with this email                            | Create both: `User { emailVerified: now if provider verified else null }` + `AuthAccount(...)`. Display-name claims (`name`) are split into `firstName` / `lastName` on first sign-in.                    | `SIGNUP { method: <p> }` + `OAUTH_LINKED` + `LOGIN_SUCCESS`. |

All four cases run inside a single `prisma.$transaction(...)` so a concurrent sign-in with the same email can't slip a duplicate `AuthAccount` row past the `@@unique([provider, providerId])` constraint, nor can two concurrent first-time sign-ins create two `User` rows with the same `email` (the column is `@unique`).

## Why case 3 refuses

Letting an unverified provider email auto-link to an existing local account would create an account-takeover vector. Concretely:

- Victim Alice signs up via email-OTP using `alice@example.com`.
- Attacker registers a Google Workspace tenant where they own the email-handle `alice@example.com` but Google has not actually verified the address (e.g. a workspace whose admin marks user emails as unverified).
- Without the case-3 refusal, the attacker's Google sign-in would silently bind their Google `sub` to Alice's local user. Next time the attacker signs in, they hold Alice's account.

The user-visible message is intentionally vague ("Sign in with your existing method and link Google from settings") — telling the attacker "Google didn't verify your email" leaks the verification gap to an enumeration script.

For Google specifically, `email_verified=true` is what almost every consumer Gmail account returns; case 3 is rare in practice but real.

## Unlinking

`DELETE /v1/auth/accounts/:provider` (in `core-auth.controller.ts`) removes the `AuthAccount` row. It refuses with **409** if the unlink would leave the user with no remaining auth method — that is, no other `AuthAccount`, no verified email, no verified phone. The check counts methods _that would remain_ and rejects when the count drops to zero.

Unlinking does **not** revoke active sessions. The user keeps using whatever device they're logged in on; they just can't start a new session via that provider. To revoke devices, call `POST /v1/auth/logout-all` separately.

## Provider-specific quirks

### Google

- ID token comes from Google Identity Services (web) or the native Google Sign-In SDK (iOS/Android). The client never hits our `/oauth/callback` — there's no redirect dance for first-party clients.
- `email_verified=true` for any consumer Gmail account. Workspace tenants can return `false`; that path is the 409 case.
- Audience whitelist is the union of `GOOGLE_CLIENT_ID_WEB | _IOS | _ANDROID`. The env validator (see `apps/api/src/config/env.ts`) requires at least one when `AUTH_GOOGLE_ENABLED=true`.
- `sub` is stable across the lifetime of the Google account and never reused — it's the canonical identifier we store in `AuthAccount.providerId`.

### Apple

Implemented by `AppleAuthModule` (`POST /v1/auth/apple`). Full details in [apple-signin.md](./apple-signin.md); summary:

- **Email only on the first sign-in.** Apple includes the `email` claim in the ID token only the very first time a user authorizes the app for a given `sub`; every subsequent sign-in omits it. The service captures the email on first link into `AuthAccount.email` and never overwrites it on later sign-ins (Apple may rotate the private-relay address; the original is the link of record).
- **Private relay.** "Hide my email" returns a `*@privaterelay.appleid.com` address that forwards to the user's real inbox. Treated identically to any other email — `emailSchema` in `@repo/api-shared` accepts it and no domain block exists.
- **`email_verified` shape.** Arrives as either a JSON boolean or the literal strings `"true"`/`"false"` depending on the SDK; `RealAppleVerifier` normalizes both to TypeScript booleans before the service sees the claims.
- **`sub` is per-app.** Apple's `sub` is keyed by `(team-id, service-id)`, so the same Apple ID emits different `sub`s in different apps you own. `(provider, providerId)` uniqueness on `AuthAccount` matches this scoping.
- **Audience.** `APPLE_SERVICE_ID` (web Sign in with Apple JS) or `APPLE_BUNDLE_ID` (native iOS SDK). At least one is required when `AUTH_APPLE_ENABLED=true`; both can be set if you ship web + iOS against the same backend.
- **Edge case — return sign-in with no `AuthAccount`.** Shouldn't happen if the first sign-in succeeded; if it does (data loss / migration) the endpoint returns 401 with a generic "Apple sign-in failed; please contact support" and emits `LOGIN_FAIL { reason: "missing-email-on-resign" }`. Don't try to recover automatically.

## Re-linking after unlink

If a user unlinks Google and signs back in with the same Google account later, case 2 (auto-link by verified email) re-creates the `AuthAccount` row. The `User` row is unchanged — same `id`, same sessions, same history. There is intentionally no "soft-unlink" / archive of past links; the row is hard-deleted on unlink and re-inserted on next sign-in.

## What this doc does NOT cover

- The **verification step** itself (signature, expiry, audience checks) — that lives in each provider's verifier (`apps/api/src/auth/modules/google/real-google-verifier.service.ts`; Apple's equivalent lives under its own module dir).
- **Session issuance** (cookie writes, refresh-token rotation) — `CoreAuthService.issueSession` and [`docs/auth/refresh-rotation.md`](./refresh-rotation.md).
- **Audit row shapes** beyond the per-case summary above — see [`docs/auth/sessions-and-audit.md`](./sessions-and-audit.md).
- **Rate limiting** — the OAuth endpoints share the `login-ip` throttler bucket with future credentials/OTP-verify endpoints; tunable via `THROTTLE_LOGIN_PER_IP_PER_MIN`.
