# `@repo/theme-native`

Native bridge for the shared theme system.

## Responsibilities

- Reuse generated tokens from `@repo/theme`.
- Configure React Native Unistyles for mobile apps.
- Provide TypeScript augmentation for native theme access.

## Exports

| Export                         | Purpose                                      |
| ------------------------------ | -------------------------------------------- |
| `@repo/theme-native`           | Native theme helpers.                        |
| `@repo/theme-native/configure` | Unistyles configuration entry point.         |
| `@repo/theme-native/unistyles` | Type declarations for Unistyles integration. |

## Commands

```bash
pnpm --filter @repo/theme-native lint
pnpm --filter @repo/theme-native check-types
```

Token changes should be made in `@repo/theme` first. This package adapts the
same design system for React Native.
