# Authentication Roadmap

The current architecture is documented in [`docs/auth/README.md`](../auth/README.md).
This file tracks remaining project work rather than duplicating implementation
details.

## Status

| Patch | Scope                                      | Status   |
| ----- | ------------------------------------------ | -------- |
| 1–17  | Authentication implementation and cleanup  | Complete |
| 18    | Documentation cleanup                      | Complete |
| 19    | Final regression and contract verification | Next     |

Trusted-proxy configuration remains deferred. The API currently treats the
direct socket address as the client IP and does not trust
`X-Forwarded-For`.

## Patch 19 checklist

- Run shared-package tests, lint, type checks, and build.
- Run API unit tests and the complete authentication E2E suite.
- Run API lint, type checks, and production build.
- Run web tests, lint, type checks, and production build.
- Regenerate OpenAPI and verify there is no contract drift.
- Verify all documented environment variables exist in `.env.example`.
- Review pending migrations and the production deployment checklist.

## Deferred features

- Apple web sign-in UI.
- Mobile authentication client.
- 2FA/TOTP.
- Email and phone change flows.
- Phone verification.
- Concurrent-session limits.
- Redis-backed distributed request throttling.
- Trusted-proxy configuration for deployments that need client-IP forwarding.
