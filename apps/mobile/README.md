# `mobile` - Expo App

Expo SDK 55 / React Native 0.83 mobile shell for the template. It currently
proves navigation, localization, theme wiring, and shared native UI components.
It is not yet a complete authenticated client.

## Current Responsibilities

- File-based routing through `expo-router`.
- Drawer navigation and example screens under `src/app/(drawer)/`.
- Shared locale resolution and message access through `src/localization/`.
- Native theme setup through `@repo/theme-native` and Unistyles.
- Shared native components from `@repo/ui-native`.
- Expo platform setup for iOS, Android, and web development.

## Not Implemented Yet

- Mobile sign-in screens.
- SecureStore token persistence.
- Bearer-token auth adapter for `@repo/api-shared`'s `apiFetch`.
- Refresh-token rotation handling on native clients.
- Google/Apple native sign-in UI.
- Account settings and active-session management screens.

See [../../docs/missing-work.md](../../docs/missing-work.md) for the planned
work.

## Local Development

From the repository root:

```bash
pnpm --filter mobile start
```

Platform-specific commands:

```bash
pnpm --filter mobile ios
pnpm --filter mobile android
pnpm --filter mobile web
```

The app has no `.env.example` yet because it does not call the API. Add mobile
runtime configuration when the native auth/API client is implemented.

## Useful Commands

| Command                        | Purpose                       |
| ------------------------------ | ----------------------------- |
| `pnpm --filter mobile start`   | Start Expo.                   |
| `pnpm --filter mobile ios`     | Run the iOS native build.     |
| `pnpm --filter mobile android` | Run the Android native build. |
| `pnpm --filter mobile web`     | Run Expo web.                 |
| `pnpm --filter mobile lint`    | Run Expo lint.                |

## Theme And UI

Use `@repo/theme-native` for token-backed Unistyles setup and `@repo/ui-native`
for shared `Dec*` components. Add design-token changes in `@repo/theme` first,
then consume the generated/native token bridge.

Avoid adding raw visual values in app screens when a token exists.
