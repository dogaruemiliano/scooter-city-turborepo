# `web` - Next.js App

Next.js 16 App Router client for the web workspace. The web app renders the
product shell, sign-in/account flows, locale routing, and theme controls.

The API remains the source of truth for authentication. The web app verifies
access JWTs locally through the API JWKS and uses `@repo/api-shared` for route
constants, schemas, and `apiFetch`.

## Responsibilities

- Render localized routes under `src/app/[locale]/`.
- Use `next-intl` routing helpers from `src/i18n/`.
- Hydrate session state through `src/components/auth/SessionProvider.tsx`.
- Verify access JWTs on the server through `src/lib/auth-server.ts`.
- Refresh expired browser sessions through the web auth adapter.
- Consume shared components from `@repo/ui` and theme CSS from `@repo/theme`.

## Local Development

From the repository root:

```bash
cp apps/web/.env.example apps/web/.env
pnpm --filter web dev
```

The app runs on <http://localhost:3001>. It expects the API at
`NEXT_PUBLIC_API_URL`, which defaults to <http://localhost:3000>.

Required environment:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

Optional environment:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` only when Google sign-in should render. It
must match the API's `GOOGLE_CLIENT_ID_WEB`.

## Useful Commands

| Command                        | Purpose                                  |
| ------------------------------ | ---------------------------------------- |
| `pnpm --filter web dev`        | Run Next.js on port 3001.                |
| `pnpm --filter web build`      | Build the production web app.            |
| `pnpm --filter web start`      | Serve the production build on port 3001. |
| `pnpm --filter web lint`       | Run ESLint.                              |
| `pnpm --filter web test`       | Run Vitest tests.                        |
| `pnpm --filter web test:watch` | Run Vitest in watch mode.                |

## Auth Integration

The important files are documented in
[src/lib/README.md](src/lib/README.md). Use these helpers instead of creating
parallel session logic:

- `meOnServer()` verifies the access JWT locally against JWKS and is fast.
- `meFromApi()` calls `GET /v1/auth/me` and is DB-fresh.
- `requireUser()` gates protected server routes.
- `webApi.fetch(...)` uses the shared `apiFetch` client and installs the web
  refresh behavior.

Cookie-authenticated mutations must go through `apiFetch` or manually include
`X-Requested-With: fetch`.

## Routes

| Route               | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `/`                 | Localized dashboard entry.                                       |
| `/sign-in`          | Email OTP and Google sign-in when enabled/configured.            |
| `/account/settings` | Profile, linked providers, sessions, logout-all, delete account. |

Apple sign-in has API support but no web UI yet. See
[../../docs/missing-work.md](../../docs/missing-work.md).

## Styling And Theme

All visual values must come from `@repo/theme` tokens. Do not add raw hex
colors, spacing values, radii, timing values, or z-indexes directly in app code
when a token exists. Add missing tokens under `packages/theme/src/tokens/` first.

Shared web components come from `@repo/ui`. Prefer those components over
one-off app primitives unless the component is truly app-specific.
