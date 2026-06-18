# Changelog

All notable changes land here. Each release promotes `Unreleased` under a dated
heading.

## Unreleased

### Added

- Custom NestJS authentication template with email OTP sign-up/sign-in, Google,
  and Apple API support.
- Opaque OTP challenges, resend metadata, OAuth email verification, and
  persistent delivery quotas.
- RS256/JWKS key handling, refresh-token rotation, CSRF guard, route throttles,
  and health/JWKS exemptions.
- Web sign-in flow, session provider, server-side JWT verification, and API
  proxy refresh handling.
- Account-management surface for profile edits, linked providers, active
  sessions, logout-all, and account deletion.
- Shared `@repo/api-shared` schemas, tests, API client helpers, and updated
  OpenAPI/Postman contracts.
- Expanded design tokens, shared UI components, Storybook examples, and native
  theme/UI alignment.

### Changed

- Centralized auth-method registry and changed `/v1/auth/enabled-methods` to
  return ordered method IDs.
- Standardized mail delivery on SMTP only; removed Resend-specific code.
- Retained SMS as a general transport while removing SMS login routes.
- Updated auth, API-shared, and template documentation to match the current
  architecture.

### Removed

- Legacy SMS OTP authentication module and schemas.
- Obsolete parallel-agent auth planning docs.
