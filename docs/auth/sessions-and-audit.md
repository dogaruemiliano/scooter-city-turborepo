# Sessions and audit log

How the auth subsystem records who is logged in, on what device, and what happened to whose account.

This doc covers the **data model only** — the cross-table layout, what each column is for, what cascades on user deletion. The runtime behavior (rotation, revocation, reuse detection) is in [`docs/auth/refresh-rotation.md`](./refresh-rotation.md) (lands in PR 5).

## The four tables

```
User ──┬── Session ──── RefreshToken
       ├── OtpToken
       ├── AuthAccount
       └── AuditEvent   (userId nullable; survives user deletion)
```

| Table          | What lives in a row                                                                                                                                                                          | Lifecycle                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Session`      | One _logged-in device_. `userAgent`, `ip`, `lastUsedAt` for the active-devices UI; `revokedAt` flips on logout or "log out other devices".                                                   | Created on every successful login. One row per device, regardless of how many refresh-token rotations the session goes through. |
| `RefreshToken` | One _plaintext refresh-token value_ ever minted. Many rows per Session (one per rotation). Stores SHA-256 HMAC of the token, not plaintext.                                                  | Created on rotation; old row's `revokedAt` is set to now. Daily cron deletes rows past `expiresAt`.                             |
| `OtpToken`     | One _one-time code_: 6 digits HMAC'd, plus an `attemptsCount` and `expiresAt`. Discriminated by `channel` (EMAIL/SMS) and `purpose` (AUTH/EMAIL_VERIFY).                                     | Created on request; `used=true` on successful verify or `attemptsCount >= 5`. Daily cron deletes rows older than 7d.            |
| `AuthAccount`  | One _OAuth identity_ linked to a user. `provider + providerId` uniquely identifies an external account; `email` saved on first link (Apple-specifically, since Apple only sends email once). | Created when a user first signs in via Google/Apple. Deleted via `DELETE /v1/auth/accounts/:provider`.                          |
| `AuditEvent`   | One _append-only event_: who did what, when, from which IP/UA, with optional `meta` JSON.                                                                                                    | Never deleted. `userId` becomes `NULL` if the user is deleted (forensics + compliance).                                         |

## Why a first-class `Session` table

Studently and m-turborepo (the inspiration repos) tracked sessions only as a `sessionId` column on `RefreshToken`. That's enough to refresh tokens but not enough to power:

- **"Active devices" UI** — show every place I'm logged in, with last-used timestamp and a "this is you" marker for the current device.
- **"Log out other devices"** — revoke every session except the current one in a single SQL `UPDATE Session SET revokedAt = now() WHERE userId = $1 AND id <> $2`.
- **Suspicious-login detection** — compare the current session's `(ua, ip)` against the user's previous sessions; trigger a new-device notification email when novel.
- **Audit forensics** — "show me every device this user has logged in from in the last 30 days".

The cost is one extra table and one extra FK from `RefreshToken`. The value is real, user-visible features.

## Primary keys

Every model uses `String @id @default(cuid())`. Reasoning is in [`docs/adr/0004-prisma-orm.md`](../adr/0004-prisma-orm.md); short version: uniform PKs avoid a JSON-serialization footgun where Prisma surfaces `BigInt` as JS `bigint`, which crashes `JSON.stringify` and would silently break the [`AllExceptionsFilter`](../../apps/api/src/common/filters/all-exceptions.filter.ts) the first time a refresh-token row appeared in an error response. The perf hit (slightly larger indexes on `RefreshToken` / `OtpToken` / `AuditEvent`) is negligible until those tables hit millions of rows; downstream projects can flip individual tables to BigInt with a deliberate migration if profiling demands.

## Cascade behavior on user deletion

`DELETE /v1/auth/me` (PR 5) issues a `DELETE FROM User WHERE id = $1` and relies on Postgres cascade rules to clean up dependent rows.

| Foreign key                           | `onDelete`    | Why                                                                                                                 |
| ------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Session.userId → User.id`            | `Cascade`     | A session belongs to exactly one user; orphaned sessions are meaningless.                                           |
| `RefreshToken.userId → User.id`       | `Cascade`     | Same.                                                                                                               |
| `RefreshToken.sessionId → Session.id` | `Cascade`     | And the row is double-cascaded via the Session it points to.                                                        |
| `OtpToken.userId → User.id`           | `Cascade`     | Unused codes lose their target.                                                                                     |
| `AuthAccount.userId → User.id`        | `Cascade`     | The OAuth-identity → user mapping is meaningless if the user is gone.                                               |
| `AuditEvent.userId → User.id`         | **`SetNull`** | Audit history outlives the user. GDPR considerations may force eventual purging, but the row stays — just detached. |

## The `AuditEvent.type` vocabulary

`AuditEvent.type` is a `String` column rather than a Postgres enum. Adding a new event type doesn't require a migration. The TS-side `AuditEventType` (defined in PR 4's `AuditModule`) is the source of truth for accepted values; the DB happily stores any string, but services should always emit a known type.

Currently expected types (will grow as features land):

| Type                  | Emitted when                                                            | `meta` carries                                                |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `SIGNUP`              | First-time sign-in for a previously-unknown identity (OTP or OAuth)     | `{ method }`                                                  |
| `EMAIL_VERIFIED`      | User completed email verification (e.g. first successful email-OTP)     | —                                                             |
| `LOGIN_SUCCESS`       | Any auth method succeeds                                                | `{ method: "email-otp" \| "sms-otp" \| "google" \| "apple" }` |
| `LOGIN_FAIL`          | OTP wrong code, OAuth verification fails                                | `{ method, reason }`                                          |
| `OAUTH_LINKED`        | New AuthAccount row created (first OAuth sign-in OR settings-side link) | `{ provider }`                                                |
| `OAUTH_UNLINKED`      | `DELETE /v1/auth/accounts/:provider` succeeded                          | `{ provider }`                                                |
| `SESSION_REVOKED`     | Single session revoked (logout or `DELETE /v1/auth/sessions/:id`)       | `{ sessionId }`                                               |
| `SESSION_BURNED`      | Reuse-detection burned every session under one `sessionId`              | `{ sessionId, reason: "reuse-detection" }`                    |
| `LOGOUT_ALL`          | `POST /v1/auth/logout-all`                                              | `{ sessionsRevoked: N }`                                      |
| `ACCOUNT_DELETED`     | `DELETE /v1/auth/me`                                                    | —                                                             |
| `NEW_DEVICE_NOTIFIED` | Login from first-seen (uaSummary, ipCountry) triggers an email          | `{ uaSummary, ipCountry }`                                    |

## What the seed creates

`pnpm db:seed` runs [`apps/api/prisma/seed.ts`](../../apps/api/prisma/seed.ts), which idempotently creates four fixture users with stable IDs (`seed-user-email-otp`, `seed-user-sms`, `seed-user-google`, `seed-user-apple`). Tests rely on these IDs being constant across `prisma migrate reset` cycles. The seed refuses to run when `NODE_ENV=production`.

| Fixture user          | Drives which test scenarios                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `seed-user-email-otp` | Email-OTP request/verify                                                         |
| `seed-user-sms`       | SMS-OTP request/verify (phone `+40700000001`)                                    |
| `seed-user-google`    | Existing Google AuthAccount → repeat-login flow + unlink-refuse-only-method flow |
| `seed-user-apple`     | Apple specifics: stored email persists after first login                         |

## Cleanup cron (PR 6 preview)

`@nestjs/schedule` will run at `0 3 * * *`:

```sql
DELETE FROM "RefreshToken" WHERE "expiresAt" < now();
DELETE FROM "OtpToken"     WHERE "expiresAt" < now() - INTERVAL '7 days';
DELETE FROM "Session"      WHERE "revokedAt" < now() - INTERVAL '30 days';
```

`AuditEvent` rows are never purged by this cron. If a downstream project needs GDPR-compliant audit purging, that's a separate, opt-in scheduled job.
