# Sign in with Apple

Apple-specific notes for `POST /v1/auth/apple`. Cross-provider linking rules (the four cases) live in [oauth-linking-rules.md](./oauth-linking-rules.md); this file covers what's _unique_ to Apple.

## Endpoint contract

`POST /v1/auth/apple` (public, throttled by the `login-ip` bucket)

Request body — `v1.auth.appleSigninSchema` in `@repo/api-shared`:

```json
{
  "idToken": "<Apple-issued JWT>",
  "fullName": { "givenName": "Ada", "familyName": "Lovelace" }
}
```

`fullName` is optional. Apple includes it only on the very first sign-in for a given `sub`; the API treats it as a hint when creating a brand-new `User` row (split into `firstName` / `lastName`).

Response — `v1.auth.TokenPair` plus `Set-Cookie` for `access_token` and `refresh_token`.

Failure modes:

- **401** — verifier rejected the token (signature, audience, issuer, or expiry); or a return sign-in arrived without a known `AuthAccount` row (data-loss case — see the matrix below).
- **409** — case 3 from [oauth-linking-rules.md](./oauth-linking-rules.md): same email exists locally, Apple did NOT verify it.
- **400** — schema validation (unknown keys, `idToken` < 20 chars, fullName fields > 80 chars).

## Verification

Apple's identity token is a JWT signed by the JWKS published at `https://appleid.apple.com/auth/keys`. The verifier (`RealAppleVerifier`) uses `jose`'s `createRemoteJWKSet`, which:

- Caches the JWKS response in memory with the `Cache-Control` max-age Apple returns. We do not roll our own cache — `jose`'s implementation handles refresh on cache-miss and on key rotation transparently.
- Re-fetches when an incoming token references a `kid` not in the current cache. Apple rotates keys roughly every six months; this is the only mechanism we rely on to pick up the rotation.

The verifier enforces:

- `iss === "https://appleid.apple.com"`
- `aud ∈ [APPLE_SERVICE_ID, APPLE_BUNDLE_ID]` — whichever are configured. At least one is required when `AUTH_APPLE_ENABLED=true`; the env-schema cross-field rule enforces it.
- `exp` is in the future, `iat` is in the past, with `±5 seconds` clock-skew tolerance.

Anything else fails-fast as `UnauthorizedException`. The error message returned to the client is intentionally generic; the actual reason goes to the server log only.

## Audience configuration

Two env vars, one of which must be set when `AUTH_APPLE_ENABLED=true`:

- **`APPLE_SERVICE_ID`** — the Service ID configured in the Apple Developer portal for the **web** Sign in with Apple JS flow. Format: reverse-DNS, e.g. `com.example.app.web`. The browser SDK's `client_id` is this Service ID.
- **`APPLE_BUNDLE_ID`** — the iOS app's Bundle ID for the **native** SDK flow. Format: reverse-DNS, e.g. `com.example.app`. The native SDK uses the Bundle ID as the audience.

When both are configured, the verifier accepts tokens with either audience. A web build and an iOS build of the same product issue tokens with different audiences and both must land on the same backend.

`APPLE_TEAM_ID` and `APPLE_KEY_ID` exist in the env schema but are not consumed by this endpoint. They're reserved for a future server-to-server flow (token revocation) that we don't ship in v1.

## The `sub` is per-app

Apple's `sub` is keyed by `(team-id, service-id)`, so the same Apple ID emits different `sub`s in different apps. Our `(provider, providerId)` unique constraint on `AuthAccount` correctly captures that: every product (Service ID) gets its own row even if the human is the same.

This also means **you cannot use the `sub` to detect that "the same person" has accounts in two different apps you own.** Apple deliberately prevents that cross-correlation.

## Email arrives only on the first sign-in

The single most important Apple quirk:

> Apple includes the `email` claim in the ID token **only on the very first sign-in for a given `sub`**. Every subsequent sign-in omits it.

Concretely, the service handles this with the following decision matrix (the four cross-provider cases plus the Apple-specific edge case):

| State at request time                                                            | Action                                                                      | Audit                                                     |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| `AuthAccount(apple, sub)` exists                                                 | Use that user. **Do NOT overwrite `AuthAccount.email`.** Issue session.     | `LOGIN_SUCCESS`                                           |
| No `AuthAccount`. Apple sent `email` + verified=true. Same-email `User` exists.  | Auto-link: insert `AuthAccount` with the email captured. Issue session.     | `OAUTH_LINKED` + `LOGIN_SUCCESS`                          |
| No `AuthAccount`. Apple sent `email` + verified=false. Same-email `User` exists. | **409**.                                                                    | `LOGIN_FAIL { reason: "email-not-verified-by-provider" }` |
| No `AuthAccount`. Apple sent `email`. No `User` for that email.                  | Create `User` (verified iff Apple verified), link `AuthAccount` with email. | `SIGNUP` + `OAUTH_LINKED` + `LOGIN_SUCCESS`               |
| No `AuthAccount`. Apple omitted `email` (return sign-in, data loss).             | **401** with a generic "please contact support" message.                    | `LOGIN_FAIL { reason: "missing-email-on-resign" }`        |

### Why we don't overwrite the stored email on subsequent sign-ins

Apple's private-relay address (`@privaterelay.appleid.com`) can change — when a user revokes-and-re-enables Sign in with Apple for a Service ID, Apple issues a new relay address. If we re-captured the email on every sign-in, the user's `AuthAccount.email` would silently drift.

The original email captured on the first sign-in is the **link of record**. It's the value we use for case-2 auto-link lookups across providers (e.g. "this Apple user already has a Google `AuthAccount` row with the same email — bind to that user"). Letting it drift would break the cross-provider linking story.

This is unusual enough that the service's `resolveOrCreateUser` carries a comment explaining it; don't optimize the comment away.

## Private relay (`@privaterelay.appleid.com`)

Apple Sign-in offers a "Hide my email" option which returns a per-user, per-app forwarding address ending in `@privaterelay.appleid.com`. Properties:

- It's a real, deliverable mailbox — Apple forwards to the user's actual address.
- It's stable for a given `(Apple ID, Service ID)` pair _unless_ the user revokes the app's access in their Apple ID settings, in which case the next sign-in returns a different relay address (see above).
- It survives standard email validation — `v1.common.emailSchema` accepts it. Do NOT add a domain block.

Treat private-relay addresses identically to any other email. We can deliver to them, they're valid for case-2 same-email linking, and the user can use them as their identifier across our product.

## The `email_verified` claim

Apple sends `email_verified` (and `is_private_email`) as either a JSON boolean OR the literal strings `"true"` / `"false"`, depending on the SDK and the audience type. `RealAppleVerifier` normalizes both to TypeScript booleans before the service sees the claims.

For a private-relay address, `email_verified` is always `true` — Apple owns the address. For a real address the user typed during Apple ID setup, `email_verified` reflects whether Apple has actually verified ownership (always `true` in practice for any account that successfully completed Apple ID enrollment).

## The `fullName` payload

The native SDKs and the browser SDK include an optional name payload OUTSIDE the ID token — it's a sibling field at the SDK callback level, not a JWT claim. The client is responsible for forwarding it to our endpoint as the `fullName` body field; we trust it as a hint when creating a brand-new user.

Per Apple's contract, `fullName` is only present on the very first sign-in. We don't re-prompt for it on subsequent sign-ins, and we don't backfill `User.firstName` / `User.lastName` from later submissions — once the user is created, name changes happen through whatever profile-edit surface the app exposes.

## Operational notes

- **JWKS unreachable.** If `appleid.apple.com/auth/keys` is unreachable when a request arrives that needs a key not in the cache, the request fails with 401. We do not fall back to a stale-but-cached entry past its TTL. The window is small enough in practice (Apple's CDN is highly available + `jose` caches aggressively) that adding a stale-while-revalidate path isn't worth the complexity.
- **Audience drift.** Adding a new Service ID (new web build, new whitelabel) requires editing `APPLE_SERVICE_ID` in env. There's intentionally no support for a CSV — you'd be telling the API to trust two different Apple Developer products as the same audience, which we don't want.
- **Server-to-server token revocation.** Out of scope for v1. The env carries `APPLE_TEAM_ID` and `APPLE_KEY_ID` so a downstream project can implement it without re-rolling the schema.
