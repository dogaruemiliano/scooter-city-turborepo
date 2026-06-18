# @repo/ui

Shared web components use `@repo/theme` tokens and Tailwind CSS v4.

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

The complete interactive reference is available at `/shadcn` in the web app.
