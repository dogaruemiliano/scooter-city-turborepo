# Missing Work And Recommended Next Steps

This document tracks known template gaps for internal planning. It distinguishes
between intentionally missing product features and operational hardening needed
before a real production deployment.

## High Priority

### Mobile authentication

Status: not implemented.

Needed:

- Native sign-in screens for email OTP.
- Google and Apple native sign-in flows.
- SecureStore token persistence.
- Bearer-token `AuthAdapter` for `@repo/api-shared` `apiFetch`.
- Refresh-token rotation and logout handling on native clients.
- Mobile account/session screens.

Why it matters: the API already returns token pairs for native clients, but the
Expo app does not yet store or refresh them.

### Production deployment runbook

Status: not documented.

Needed:

- Hosting targets for API, web, database, and mobile release builds.
- Environment variable ownership and secret-management process.
- Migration process using `pnpm --filter api db:deploy`.
- Rollback approach for app code and database migrations.
- Domain, CORS, cookie, TLS, and proxy configuration guidance.

Why it matters: local and CI workflows exist, but production operations are not
yet a repeatable internal process.

### Observability

Status: baseline logging only.

Needed:

- Metrics collection.
- Error tracking.
- Distributed tracing or request correlation across web/API.
- Alerting for auth failures, OTP abuse, queue/provider failures, DB health, and
  latency.
- Log retention policy and dashboard ownership.

Why it matters: `nestjs-pino` and request IDs are present, but production support
needs searchable telemetry and alerting.

## Medium Priority

### Apple web sign-in UI

Status: API implemented, web UI missing.

Needed:

- Browser Apple JS/sign-in integration.
- Method-specific challenge handling in `SignInMethods`.
- UI tests for enabled/disabled Apple states.
- Documentation for required Apple web configuration.

### Apple server-to-server revocation

Status: not implemented.

Needed:

- Apple client-secret generation using team/key IDs.
- Server-to-server revocation call on unlink/delete where required.
- Tests for success, provider failure, and retry/logging behavior.

### Deployment hardening

Status: partially covered by config validation and health checks.

Needed:

- Trusted proxy policy.
- Hosting-level DDoS and rate-limit strategy.
- Backup and restore procedure.
- JWT key rotation runbook.
- Refresh/OTP HMAC secret rotation guidance.
- SMTP/SMS provider failure playbook.

### Web product shell

Status: functional template shell.

Needed:

- Product-specific dashboard/navigation.
- Real onboarding flow after first sign-in.
- Domain modules beyond auth/users/account settings.
- More complete empty, loading, and error states for product screens.

## Lower Priority

### Additional account security features

Status: out of scope for the current template.

Candidates:

- 2FA/TOTP.
- Email change flow.
- Phone verification flow.
- Password login, only if a product explicitly needs it.
- Device notification emails beyond the current audit/session foundation.

### API client generation

Status: shared handwritten contracts plus OpenAPI snapshot.

Possible next step:

- Add generated clients only if they reduce duplication without weakening the
  `@repo/api-shared` source-of-truth model.

### Documentation expansion

Status: enough for internal onboarding.

Useful additions:

- Production deployment examples once a target platform is chosen.
- Architecture diagrams.
- Auth sequence diagrams.
- Mobile auth implementation notes after native work starts.

## Not Planned By Default

- Replacing custom auth with NextAuth, Auth.js, Lucia, or similar.
- Moving API contracts out of `@repo/api-shared`.
- Removing Prisma 7 driver-adapter setup.
- Hard-coding design values outside the token packages.
- Publishing this repository as open source without a licensing decision.
