# ADR 0002 — Cookie-based sessions (no `next-auth`)

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** template author

## Context

The web client needs a session mechanism that:

1. Survives the JS-side XSS attack surface (token can't be read by `document.cookie`-equivalent JS).
2. Doesn't depend on a one-vendor authentication library (Auth.js / NextAuth had a known refresh-token race the m-turborepo reference repo had to work around).
3. Works for both browser (cookie) and mobile (Authorization header) consumers without two parallel auth code paths.

The two reference repos took different routes here:

- `studently` uses `next-auth` (then-current NextAuth) end-to-end.
- `m-turborepo` ripped NextAuth out specifically to fix the refresh-token race condition, replacing it with raw HttpOnly cookies set by the API.

We follow the m-turborepo approach.

## Decision

The API sets **HttpOnly cookies** (`access_token`, `refresh_token`) directly. The web client never sees the tokens from JavaScript. The Next.js `proxy.ts` middleware (PR 14) reads cookies server-side to decide when to lazy-refresh.

Mobile clients get the **same JWTs returned in the JSON body** of every issuing endpoint, and pass them back via `Authorization: Bearer …` on subsequent requests. The API's JWT extractor is cookie-first, Bearer-fallback — same identity check, two transports.

We do **not** use `next-auth`, `lucia`, `better-auth`, or any other auth library. The session is exactly:

- A `Session` row identifying the device.
- A `RefreshToken` row chain rooted at that session, with the rotation algorithm in [`docs/auth/refresh-rotation.md`](../auth/refresh-rotation.md).
- Two signed JWTs.

That's it.

## Reasoning

1. **XSS resistance.** HttpOnly + `SameSite=Lax` + `Secure` (in prod) blocks every browser-side attack vector for the token itself. An XSS still owns the page-while-open, but the attacker can't exfiltrate the token to another origin.

2. **No vendor coupling.** Auth.js / NextAuth changes its session-callback shapes between major versions; the template would inherit those breakages. Raw cookies are a 30-year-old stable contract.

3. **Refresh race ownership.** The race we worked around (m-turborepo's documented bug) was specific to NextAuth's client-side refresh-token handling — two concurrent requests would both attempt the refresh and one would fail. Our [chain-based rotation](../auth/refresh-rotation.md) makes the race a non-issue at the server layer; the client doesn't have to coordinate.

4. **One auth surface for two consumers.** Cookie-first / Bearer-fallback means the same JWT validation, the same JwtStrategy, the same `AuthPrincipal` — regardless of whether the request came from a browser or React Native. No "session for web, token for mobile" duality.

5. **Predictable cost.** A NestJS app + two cookies + one DB-backed session table is shippable in one PR (this one) with a small enough surface that future-us can read every line. NextAuth integration would have been a multi-PR adoption with a documentation tail.

## Trade-offs accepted

- **No social-login UI batteries.** NextAuth ships a polished sign-in flow with provider buttons; we build our own (PR 14+, web side). Worth it because each provider's actual server-side verification is a few dozen lines — most of NextAuth's complexity sits in the parts we're replacing.
- **No magic session refresh.** With NextAuth, `useSession()` Just Works on the client. With our setup, the web's `proxy.ts` middleware does lazy refresh; client components query a server-rendered `<CurrentUserProvider>`. Different mental model, same end result.
- **eTLD+1 deployment constraint.** Documented in [`docs/auth/cookies.md`](../auth/cookies.md). Cross-origin deployments need an extra CSRF layer.

## Consequences

- Cookie names live in `@repo/api-shared` so API + web can't drift.
- Every issuing endpoint sets cookies via the `setAuthCookies` helper — no direct `res.cookie(...)` calls in controllers.
- Logout / delete-me clear cookies via `clearAuthCookies` with matching `path` + `domain` attributes (otherwise `clearCookie` silently no-ops).
- The web client never reads or writes cookies from JavaScript. Next.js server actions + middleware handle all cookie mutation server-side.

## Alternatives considered

- **NextAuth / Auth.js.** Rejected for vendor-coupling and the known refresh-race history. Also pulls in client-side state management that we don't want for a Next.js App Router app.
- **Lucia.** Closer to our setup but ships its own session-table conventions that fight with our `Session` + `RefreshToken` separation.
- **better-auth.** Newer, similar shape to NextAuth, less battle-tested. Same coupling concerns.
- **Bearer-only (no cookies).** Forces every page load to hydrate the token from `sessionStorage` / IndexedDB which is JS-readable. Worse XSS posture.
