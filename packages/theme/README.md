# `@repo/theme`

Single source of truth for web/runtime design tokens.

## Responsibilities

- Store primitive and semantic tokens under `src/tokens/`.
- Generate CSS variables for web consumers.
- Generate runtime/native token output consumed by native packages.
- Provide Tailwind CSS integration through `@repo/theme/tailwind`.

## Exports

| Export                 | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `@repo/theme`          | TypeScript token access.                 |
| `@repo/theme/css`      | Generated CSS variables.                 |
| `@repo/theme/runtime`  | Generated runtime token object.          |
| `@repo/theme/native`   | Alias for generated native token output. |
| `@repo/theme/tailwind` | Tailwind preset/integration.             |

## Commands

```bash
pnpm --filter @repo/theme build
pnpm --filter @repo/theme lint
pnpm --filter @repo/theme check-types
pnpm --filter @repo/theme test
```

## Adding tokens

Add missing values to the matching file in `src/tokens/`:

- `primitives.ts`
- `semantic.ts`
- `spacing.ts`
- `radius.ts`
- `typography.ts`
- `shadow.ts`
- `motion.ts`
- `z-index.ts`
- `breakpoints.ts`

Prefer extending an existing scale over creating a parallel scale. App and UI
code should consume tokens instead of hard-coded visual values.
