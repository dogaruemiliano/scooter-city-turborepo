# @repo/ui

Shared web components use `@repo/theme` tokens and Tailwind CSS v4.

## Responsibilities

- Provide reusable React components for `apps/web`.
- Wrap Base UI and shadcn primitives in the project's token system.
- Export app-consumable components through explicit package entry points.
- Maintain Storybook examples for reusable components.

## shadcn with Base UI

The shadcn CLI is configured with the Nova/Mist Base UI preset. Add primitives
with:

```bash
pnpm --filter @repo/ui shadcn:add dialog
```

Generated components are available from `@repo/ui/components` or individual
`@repo/ui/components/*` entry points. Their flat color roles come from
`@repo/theme`; add missing semantic roles there before introducing new visual
values.

## Commands

```bash
pnpm --filter @repo/ui dev              # Storybook on :6006
pnpm --filter @repo/ui build-storybook  # static Storybook build
pnpm --filter @repo/ui lint
pnpm --filter @repo/ui check-types
```

## Token rule

Components must consume visual values from `@repo/theme`. Add missing semantic
roles or scale values in `packages/theme/src/tokens/` before introducing new
component styling.
