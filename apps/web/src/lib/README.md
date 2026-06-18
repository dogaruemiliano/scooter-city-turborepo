# `apps/web/src/lib/` — auth helpers

Custom-rolled auth integration. NestJS owns tokens; this app verifies them locally via the API's JWKS.

## Files

- [`api.ts`](./api.ts) — validates the required public NestJS origin and exports the single bound `webApi` client used by browser, RSC, and Proxy code.
- [`jwks.ts`](./jwks.ts) — module-level `JWKS = createRemoteJWKSet(...)`. Caches the API's public keys internally (~10min TTL, ~30s cooldown on miss). Don't construct your own — share this instance.
- [`auth-server.ts`](./auth-server.ts) — server-only session helpers (`meOnServer`, `meFromApi`, `requireUser`).
- [`auth-adapter-web.ts`](./auth-adapter-web.ts) — installs `@repo/api-shared`'s `AuthAdapter` so `webApi.fetch` calls from Client Components transparently refresh on 401 (singleflight, 5s timeout).
- [`theme-cookie.ts`](./theme-cookie.ts) — unrelated, predates this module.

## Server-side session lookup

Two flavours — pick by freshness need.

### `meOnServer()` — fast, no round-trip

```tsx
// app/dashboard/page.tsx
import { meOnServer } from "@/lib/auth-server";

export default async function Dashboard() {
  const me = await meOnServer(); // verifies the access JWT against JWKS
  if (!me) redirect("/sign-in");
  return <h1>Hello {me.email}</h1>;
}
```

What's in `me`: only fields the JWT carries — `id`, `email`, `roles`.

**Trade-off:** the JWT can be up to 15 minutes (`JWT_ACCESS_TTL`) stale relative to the DB. A session revoked server-side will still appear valid on the client until the access token expires.

### `meFromApi()` — DB-fresh, costs one round-trip

```tsx
// app/settings/page.tsx
import { meFromApi } from "@/lib/auth-server";

export default async function Settings() {
  const me = await meFromApi(); // GET /v1/auth/me with the cookie
  if (!me) redirect("/sign-in");
  return <ProfileForm user={me} />;
}
```

Use when:

- The page shows profile fields (`firstName`, `phone`, etc.).
- The page surfaces server-side state mutations (just-verified email, just-rotated role).
- The page is high-trust enough to want immediate revoke detection.

### `requireUser()` — gate helper

```tsx
const me = await requireUser(); // throws-via-redirect to /sign-in if no session
```

Equivalent to `meOnServer()` + `redirect("/sign-in")` on null.

## Client-side session

```tsx
"use client";
import { useSession } from "@/components/auth";

export function UserMenu() {
  const { user, setUser } = useSession();
  if (!user) return null;
  return <span>{user.email}</span>;
}
```

The provider's `initialUser` is hydrated from the root layout's `meOnServer()` call, so the first paint already has the session — no flash-of-logged-out.

`setUser(null)` lets you locally reflect a logout without forcing a full page navigation. The [`LogoutButton`](../components/auth/LogoutButton.tsx) does this after calling `webApi.fetch(v1.auth.ROUTES.logout)`.

## Why this design

- **No NextAuth / Auth.js / Lucia.** Token issuance + rotation happens entirely in NestJS — see [`apps/api/src/auth/`](../../../../apps/api/src/auth/) and especially [`docs/auth/refresh-rotation.md`](../../../../docs/auth/refresh-rotation.md).
- **JWKS, not BFF.** The browser hits `api.example.com` directly with `credentials: "include"`. Next.js does not proxy data — it just renders pages and gates routes.
- **Private key stays on the API.** Next.js only ever holds the public key, fetched once and cached by `createRemoteJWKSet`.

## Required environment

See [`apps/web/.env.example`](../../.env.example):

- `NEXT_PUBLIC_API_URL` — required public origin of the NestJS API (`http://localhost:3000` in dev). It must be an absolute HTTP(S) origin with no path, query, fragment, or credentials. Browser requests, RSCs, JWKS lookup, and Proxy refreshes all use this same value.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — optional; only required if the Google sign-in button should render.

## Sign-in challenge state

`SignInMethods` owns the active email or Google OTP challenge. While a
challenge is active, all other sign-in controls are replaced by one shared
`OtpChallengeForm`.

- Email challenge renewal reuses the email held in React state.
- Google challenge renewal reuses the Google ID token held in React memory.
- A page reload or rejected Google token discards that proof and requires the
  Google button again.
- Email addresses, challenge IDs, and provider tokens are never persisted in
  URLs, cookies, `localStorage`, or `sessionStorage`.

## Auth-method discovery

The sign-in page fetches `GET /v1/auth/enabled-methods`, whose response is an
ordered list such as `{ "methods": ["emailOtp", "google"] }`.

The list describes server-enabled capabilities. `SignInMethods` still checks
for explicit web support and client-side configuration:

- `emailOtp` renders the email form.
- `google` renders only when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is also set.
- `apple` is ignored until Apple web sign-in is implemented.
- No usable web method renders the unavailable-method message.

Do not render arbitrary method IDs generically. OAuth SDK setup and challenge
handling remain method-specific client code.
