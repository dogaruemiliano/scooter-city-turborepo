# Auth cookies

How HttpOnly cookies are set, what flags they carry, and the eTLD+1 constraint downstream projects need to know about.

## Cookies set

| Name            | Lifetime                          | Purpose                                                            |
| --------------- | --------------------------------- | ------------------------------------------------------------------ |
| `access_token`  | `JWT_ACCESS_TTL` (default `15m`)  | Short-lived JWT consumed by every authenticated request.           |
| `refresh_token` | `JWT_REFRESH_TTL` (default `90d`) | Long-lived JWT used by `POST /v1/auth/refresh` to rotate the pair. |

Both names live in [`@repo/api-shared`](../../packages/api-shared/src/cookies.ts) (`ACCESS_TOKEN_COOKIE`, `REFRESH_TOKEN_COOKIE`). Renaming requires a coordinated change across the API's cookie helpers, the web `proxy.ts` middleware (PR 14), and any persisted browser jar — old sessions get evicted on first request.

## Flags

Set by [`apps/api/src/auth/utils/cookies.ts`](../../apps/api/src/auth/utils/cookies.ts):

| Flag       | Value                                 | Why                                                                                                                                                                   |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HttpOnly` | `true`                                | JavaScript can't read the cookie. Limits XSS-driven token theft to "they can use the session while the page is open" rather than "exfiltrate to attacker server."     |
| `Secure`   | `true` in production, `false` in dev  | Browsers refuse to send `Secure` cookies over HTTP — would break `http://localhost` dev. NODE_ENV-derived.                                                            |
| `SameSite` | `Lax`                                 | Browser sends cookies on top-level navigations and same-site fetches; blocks them on cross-site `POST` (CSRF mitigation). Forces an **eTLD+1 constraint**, see below. |
| `Path`     | `/`                                   | Cookies travel on every request to the API origin including `/v1/auth/refresh`.                                                                                       |
| `Domain`   | `COOKIE_DOMAIN` env, omitted if empty | Set to `.example.com` in production so the web app at `app.example.com` and the API at `api.example.com` share the cookie.                                            |
| `Max-Age`  | Matches JWT `exp`                     | Browser drops the cookie exactly when the JWT becomes invalid. Saves a round trip.                                                                                    |

## The eTLD+1 constraint

`SameSite=Lax` cookies are bound to an effective top-level domain plus one (eTLD+1). Concretely:

- **OK in production:** `app.example.com` + `api.example.com` (same eTLD+1 `example.com`).
- **OK in dev:** `localhost:3001` (web) + `localhost:3000` (API) — same host, just different ports.
- **NOT OK:** `myapp.com` (web) + `myapp-api.com` (API). Different eTLD+1; the API's cookies never reach the web app.

If a downstream project genuinely needs cross-origin (different eTLD+1) cookies, the choice is:

1. **Set `SameSite=None; Secure`** and add a CSRF-protection layer (double-submit cookie / custom header). The current code does NOT include CSRF protection; the locked plan deliberately chose Lax + same-eTLD+1.
2. **Embed the API as a reverse-proxy path** of the web origin (`example.com/api/...`). Then it's same-site and Lax works.

## Why Lax over None (CSRF stance)

The locked plan picked `SameSite=Lax` and skipped CSRF middleware. Trade-offs:

|                       | `Lax` (chosen)                                                                | `None; Secure` + CSRF middleware                              |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Setup cost            | Zero                                                                          | Adds double-submit cookie pattern or `csurf`-style middleware |
| Cross-origin support  | No (eTLD+1 constraint)                                                        | Yes                                                           |
| CSRF risk             | Mostly mitigated by Lax itself + JSON-only endpoints with content-type checks | Mitigated by explicit token check                             |
| Operational footprint | One thing to remember (the eTLD+1 rule)                                       | Two (the rule + the CSRF token storage / rotation)            |

The template is opinionated for the common case (same-eTLD+1 deployment) and documents the escape hatch. Switching is a per-project decision; if you flip `SameSite` to `None`, add CSRF protection at the same time.

## Set/clear contract

The helpers in `cookies.ts` are the only place the cookie attributes are constructed. Direct calls to `res.cookie(...)` from controllers are a code smell — they will drift.

```ts
setAuthCookies(res, env, {
  accessToken,
  refreshToken,
  accessTokenExpiresInSec,
  refreshTokenExpiresInSec,
});

clearAuthCookies(res, env);
```

`clearAuthCookies` mirrors the set-time `path` and `domain` exactly — `clearCookie` only matches when those attributes line up, otherwise it does nothing and the cookie quietly survives.
