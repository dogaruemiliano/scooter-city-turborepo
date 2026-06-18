# Cookies and CSRF

The web app authenticates with two HttpOnly cookies set by NestJS.

## Cookies

| Cookie          | Default lifetime | Purpose                            |
| --------------- | ---------------- | ---------------------------------- |
| `access_token`  | 15 minutes       | Authenticates normal API requests. |
| `refresh_token` | 90 days          | Rotates the token pair.            |

Cookie names are defined in
[`auth.constants.ts`](../../packages/api-shared/src/v1/auth/auth.constants.ts).
Cookie options are centralized in
[`cookies.ts`](../../apps/api/src/auth/utils/cookies.ts).

Both cookies use:

- `HttpOnly=true`
- `Secure=true` in production
- `SameSite=Lax`
- `Path=/`
- `Domain=COOKIE_DOMAIN` when configured
- `Max-Age` matching the JWT expiry

Clearing a cookie must use the same path and domain that were used when setting
it. Controllers therefore use `setAuthCookies()` and `clearAuthCookies()`
instead of calling `res.cookie()` directly.

## Deployment requirement

`SameSite=Lax` works when the web app and API are same-site:

- `app.example.com` and `api.example.com`
- `localhost:3001` and `localhost:3000`

It does not work for unrelated sites such as `myapp.com` and
`myapp-api.com`.

For the default deployment:

```env
COOKIE_DOMAIN=.example.com
CORS_ORIGINS=https://app.example.com
```

The browser calls the API directly with `credentials: "include"`.

## CSRF protection

Cookie-authenticated mutations must include:

```http
X-Requested-With: fetch
```

The global `CsrfGuard` enforces this rule when an access or refresh cookie is
present.

The guard skips:

- `GET`, `HEAD`, and `OPTIONS`
- Requests without auth cookies, such as Bearer-token native clients
- Routes explicitly decorated with `@SkipCsrf()`

The custom header forces cross-origin browser requests through CORS preflight.
Only origins in `CORS_ORIGINS` are allowed.

`@repo/api-shared` adds the header to mutations automatically. Manual browser
requests must add it themselves.

## Different-site deployments

Using `SameSite=None` requires `Secure=true` and a deliberate review of cookie,
CORS, and CSRF behavior. Do not change the cookie mode without preserving the
custom-header protection.
