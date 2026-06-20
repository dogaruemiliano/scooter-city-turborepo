# `@repo/i18n`

Shared locale contract, message catalogs, and dependency-free formatting helpers
for API, web, and mobile.

## Responsibilities

- Define supported locales.
- Export shared message catalogs.
- Provide formatting helpers that do not depend on a specific UI framework.
- Keep API error messages and client UI messages aligned.

## Exports

| Export                | Purpose                                    |
| --------------------- | ------------------------------------------ |
| `@repo/i18n`          | Locale definitions, catalogs, and helpers. |
| `@repo/i18n/messages` | Message catalog entry point.               |

## Commands

```bash
pnpm --filter @repo/i18n build
pnpm --filter @repo/i18n check-types
pnpm --filter @repo/i18n test
```

When adding user-facing copy that is shared across apps, add it here rather than
duplicating strings in app packages.
