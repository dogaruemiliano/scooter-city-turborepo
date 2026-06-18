<!-- BEGIN:auth-rule -->

# Auth is custom-rolled — do not pull in NextAuth / Auth.js / Lucia

NestJS owns token issuance, refresh-rotation, OAuth verification, and OTP. The web app verifies access JWTs locally via the API's JWKS (`/.well-known/jwks.json`) using `jose`. The mobile app holds tokens in SecureStore and authenticates with Bearer headers. The shared `apiFetch` ([`packages/api-shared/src/api-fetch.ts`](packages/api-shared/src/api-fetch.ts)) uses an `AuthAdapter` interface so each runtime plugs in its own refresh behavior.

If you need to touch anything auth-related:

- **Refresh rotation algorithm**: [`docs/auth/refresh-rotation.md`](docs/auth/refresh-rotation.md) + [ADR-03](docs/adr/0003-multi-instance-refresh-rotation.md). Don't redesign — it's multi-instance-safe and prod-tested.
- **RS256 + JWKS + key rotation**: [`apps/api/src/auth/utils/keys.ts`](apps/api/src/auth/utils/keys.ts) is the single source of truth for kid derivation (RFC 7638 thumbprint). Both sign and verify go through the same `KeyRing` — asymmetry breaks verification.
- **Web session helpers**: [`apps/web/src/lib/README.md`](apps/web/src/lib/README.md) — `meOnServer()` (fast, JWKS) vs `meFromApi()` (DB-fresh round-trip).
- **CSRF defense**: cookie-bearing mutations must carry `X-Requested-With: fetch`. The shared `apiFetch` adds it automatically; manual fetches need to as well.
- **DO NOT** install `next-auth`, `@auth/core`, `lucia`, or any other auth library. Routes are added to NestJS first, then the schema lands in `@repo/api-shared/v1/auth`, then the web/mobile clients consume the schema.

<!-- END:auth-rule -->

<!-- BEGIN:theme-tokens-rule -->

# Theme tokens are the single source of truth

Every visual or motion value — color, spacing, radius, typography, shadow, motion (duration/easing), z-index, breakpoint — **must** come from [`packages/theme/src/tokens/`](packages/theme/src/tokens/). Consume them via `@repo/theme` (web/Tailwind) or `@repo/theme-native` (React Native).

**Never hard-code** a literal where a token exists. No raw `#hex`/`rgb()`/`hsl()`, no `16px`/`1rem`, no `250ms`, no `cubic-bezier(...)`, no `9999px`, no `border-radius: 4px`, no `z-index: 100`. This applies to TSX/JSX, CSS, Tailwind class arbitraries (`text-[#abc]`, `p-[13px]`), inline styles, and styled-component template strings.

**If the value you need is not in the theme, add it first.** Open the matching file in [`packages/theme/src/tokens/`](packages/theme/src/tokens/) — [`primitives.ts`](packages/theme/src/tokens/primitives.ts), [`semantic.ts`](packages/theme/src/tokens/semantic.ts), [`spacing.ts`](packages/theme/src/tokens/spacing.ts), [`radius.ts`](packages/theme/src/tokens/radius.ts), [`typography.ts`](packages/theme/src/tokens/typography.ts), [`shadow.ts`](packages/theme/src/tokens/shadow.ts), [`motion.ts`](packages/theme/src/tokens/motion.ts), [`z-index.ts`](packages/theme/src/tokens/z-index.ts), [`breakpoints.ts`](packages/theme/src/tokens/breakpoints.ts) — extend the relevant `as const` object with a semantically-named key, then consume the new token. Prefer extending an existing scale over inventing a parallel one.

**Allowed literals:** `0`, `auto`, `none`, `currentColor`, `transparent`, and structural CSS values that aren't design decisions (`display: flex`, `position: absolute`, `overflow: hidden`, etc.). When in doubt, add a token.

<!-- END:theme-tokens-rule -->

<!-- BEGIN:prisma-verify-rule -->

# Prisma — verify the docs before writing any code

**Your training data is older than this project's Prisma version. The architecture changed materially between Prisma 6 and Prisma 7. Code that "looks right" from memory will fail at runtime, reference removed APIs, or miss required configuration.**

## Hard rule

Before writing any Prisma schema, client code, migration command, or configuration in this project, you **must** verify against the current Prisma documentation. Do not rely on training-data recall for Prisma. Ever.

## Verification protocol

1. **Check the installed version first.** Read `apps/api/package.json` and find `prisma` and `@prisma/client`. Note the major version.

2. **If the major version is ≥ 7, treat all Prisma knowledge from training as suspect.** Search the current Prisma docs (`https://www.prisma.io/docs`) or the latest changelog (`https://www.prisma.io/changelog`) before writing schema, generator config, client instantiation, or CLI commands.

3. **Specific topics to re-verify every time, regardless of version:**
   - `schema.prisma` `generator` block syntax and required fields
   - Whether `url` belongs in `datasource` or `prisma.config.ts`
   - How `PrismaClient` is instantiated (adapter required or not)
   - Driver adapter package names and APIs (e.g. `@prisma/adapter-pg`)
   - Import paths for the generated client
   - Environment variable loading behavior in CLI commands
   - SSL/TLS defaults
   - Connection pool defaults

4. **State your assumption explicitly when proposing code.** Example:

   > "Based on docs read at <URL> on <date>, Prisma 7 requires a driver adapter. The instantiation pattern is `new PrismaClient({ adapter: new PrismaPg({...}) })`. Proceeding with that pattern."

   If the user contradicts your assumption, do not argue — re-read the docs.

## Why this project's Prisma setup may look unfamiliar

This project uses **Prisma 7** (released late 2025). The Rust-based query engine that defined Prisma from v1 through v6 was **removed by default**. The current architecture:

- TypeScript/WebAssembly query compiler (no native binary)
- **Driver adapter is mandatory**, not optional (was optional in v5/v6)
- Generator is `prisma-client` (was `prisma-client-js`)
- Generated client lives at an explicit `output` path, **not in `node_modules`**
- `datasource.url` moved to `prisma.config.ts`
- Prisma CLI no longer auto-loads `.env` — use `dotenv/config` explicitly
- Different connection pool defaults (driver-adapter-dependent)
- Stricter SSL defaults (no longer ignores invalid certs)

If anything you write contradicts the above list, you are writing Prisma 6 code in a Prisma 7 project. Stop and re-read.

## Required project setup (canonical reference)

The following is the verified-correct setup for this project. Match it.

### `prisma/schema.prisma`

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  engineType   = "client"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}
```

Do not:

- Use `provider = "prisma-client-js"` (legacy, deprecated in v7)
- Omit `output` (no longer optional)
- Put `url = env("DATABASE_URL")` inside `datasource` (moved to `prisma.config.ts`)

### `prisma.config.ts` (project root)

```ts
import { defineConfig } from "prisma/config";
import "dotenv/config";

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
```

### `apps/api/src/prisma/prisma.service.ts`

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow("DATABASE_URL"),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    super({ adapter, log: ["warn", "error"] });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

Notes:

- Import path is `../generated/prisma/client`, **not** `@prisma/client`
- Pool settings are explicit because `pg`'s defaults differ from Prisma 6's defaults — do not remove them
- `connectionTimeoutMillis: 5_000` matches Prisma 6 behavior; `pg`'s default is `0` (no timeout) which causes silent hangs

### `package.json` dependencies (verify present)

Runtime:

- `@prisma/client`
- `@prisma/adapter-pg`
- `pg`
- `dotenv`

Dev:

- `prisma`
- `@types/pg`

If you add code that uses Prisma and any of these are missing, install them. Do **not** install `@prisma/engines` or anything referring to "rust binary" / "rust engine" — those are Prisma 6 artifacts.

## Commands

Use these patterns:

```bash
pnpm prisma generate              # regenerates the client into src/generated/prisma
pnpm prisma migrate dev --name
pnpm prisma migrate status
pnpm prisma db pull               # introspect
```

Do **not** use:

- `pnpm prisma migrate reset` (denied in `.claude/settings.json` — destructive)
- `pnpm prisma db push --force-reset` (denied — destructive)

If you need a destructive migration, ask the user to run it themselves.

## Generalize this rule

The same verification protocol applies to **any rapidly-evolving library**. Before writing code involving these, check current documentation:

- Prisma (every release changes something)
- Next.js (major versions break things; App Router moves fast)
- NestJS (decorators and module patterns shift)
- Expo / React Native (SDK upgrades change APIs frequently)
- tRPC, TanStack Query, Zod (API surfaces evolve)
- Vercel AI SDK, Anthropic SDK (very fast iteration)
- Anything with a 0.x version

If your training data is more than 6 months old and the library has had a major release since then, web-search the docs before writing code. The cost of one web search is much smaller than the cost of one round of "this doesn't work, let me try again."

## Self-check before committing Prisma-touching code

- [ ] I verified the docs against the project's Prisma major version
- [ ] No imports from `@prisma/client` (should be from the generated output path)
- [ ] No `url` field inside `datasource` in `schema.prisma`
- [ ] `PrismaClient` is instantiated with a driver adapter
- [ ] Pool settings are explicit, not relying on `pg` defaults
- [ ] No references to `engineType = "binary"` or `engineType = "library"`
- [ ] CLI commands assume `dotenv/config` is loaded explicitly

If any box is unchecked, the code is wrong for this project.

## When in doubt, ask

A clarifying question costs 10 seconds. A wrong implementation costs 30 minutes of debugging plus a correction round-trip.

A good clarifying question:

> "Before I write the schema, I want to confirm: this project is on Prisma 7 with the driver-adapter pattern, generated client at `src/generated/prisma`. Should I match the existing `PrismaService` setup, or is there something specific about this migration I should know?"

A bad approach:

> _(writes 200 lines of Prisma 6 code, ships it, breaks the build)_

<!-- END:prisma-verify-rule -->
