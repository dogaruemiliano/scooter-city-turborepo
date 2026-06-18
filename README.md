# Turborepo full-stack template

Opinionated monorepo for:

- NestJS 11 API
- Next.js 16 web app
- PostgreSQL with Prisma 7
- Shared Zod/OpenAPI contracts
- Shared web and React Native UI/theme packages
- Custom email OTP, Google, and Apple authentication

## Requirements

- Node.js 20 or newer
- pnpm 9
- Docker

## Local setup

```bash
# Install dependencies
pnpm install

# Start PostgreSQL on localhost:5434
docker compose up -d postgres

# Create local environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

For local API development:

1. Set `REFRESH_TOKEN_HMAC_SECRET` and `OTP_HMAC_SECRET` to values of at least
   32 characters.
2. Configure an SMTP relay that supports authentication:

   ```env
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_USER=local-user
   SMTP_PASSWORD=local-password
   ```

3. Leave `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` empty. Development keys are
   generated under `apps/api/.dev-keys/` on first startup.

Apply migrations:

```bash
pnpm --filter api db:migrate
```

Start the workspace:

```bash
pnpm dev
```

Default URLs:

- Web: <http://localhost:3001>
- API: <http://localhost:3000>
- Swagger: <http://localhost:3000/api-docs>
- Health: <http://localhost:3000/healthz>
- JWKS: <http://localhost:3000/.well-known/jwks.json>

Non-production OTP codes are always `000000`.

## Workspace

```text
apps/
├── api/          NestJS API
├── web/          Next.js web app
└── mobile/       React Native application

packages/
├── api-shared/        Shared API schemas and fetch client
├── theme/             Web design tokens
├── theme-native/      Native design tokens
├── ui/                Web UI components
├── ui-native/         Native UI components
├── eslint-config/     Shared ESLint configuration
└── typescript-config/ Shared TypeScript configuration
```

## Authentication

NestJS owns token issuance, refresh rotation, OAuth verification, and OTP.
The web app calls the API directly and verifies access JWTs through JWKS.

Supported API methods:

- Email OTP sign-up and sign-in
- Google ID-token exchange
- Apple ID-token exchange

See [`docs/auth/README.md`](docs/auth/README.md) for architecture, endpoints,
security controls, and deployment requirements.

## Common commands

| Command                        | Purpose                          |
| ------------------------------ | -------------------------------- |
| `pnpm dev`                     | Run workspace development tasks. |
| `pnpm build`                   | Build the workspace.             |
| `pnpm lint`                    | Run ESLint.                      |
| `pnpm check-types`             | Run TypeScript checks.           |
| `pnpm test`                    | Run unit tests.                  |
| `pnpm test:e2e`                | Run E2E tests.                   |
| `pnpm gen:env`                 | Regenerate API `.env.example`.   |
| `pnpm gen:openapi`             | Regenerate `openapi.json`.       |
| `pnpm --filter api db:migrate` | Apply local Prisma migrations.   |
| `pnpm --filter api db:seed`    | Seed local development data.     |

## Documentation

- [`docs/auth/`](docs/auth/) — authentication behavior and operations
- [`docs/adr/`](docs/adr/) — architectural decisions
- [`packages/api-shared/README.md`](packages/api-shared/README.md) — shared API contracts
- [`apps/web/src/lib/README.md`](apps/web/src/lib/README.md) — web session helpers

## License

UNLICENSED — internal template.
