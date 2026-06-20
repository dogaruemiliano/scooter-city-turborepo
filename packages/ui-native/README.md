# `@repo/ui-native`

Shared React Native component package.

## Responsibilities

- Provide reusable `Dec*` components for `apps/mobile`.
- Consume native theme values through `@repo/theme-native`.
- Keep platform-neutral native UI separate from app-specific screens.

## Components

Current exports include:

- `DecBadge`
- `DecBlur`
- `DecBottomSheet`
- `DecButton`
- `DecCard`
- `DecInput`
- `DecText`

## Commands

```bash
pnpm --filter @repo/ui-native lint
pnpm --filter @repo/ui-native check-types
```

Add reusable native primitives here. Keep product-specific mobile screens in
`apps/mobile`.
