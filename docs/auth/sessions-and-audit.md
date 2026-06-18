# Sessions and audit events

## Data model

```text
User
├── Session ── RefreshToken
├── OtpChallenge
├── AuthAccount
└── AuditEvent

OtpDeliveryQuota is independent of User.
```

| Model              | Purpose                                                       |
| ------------------ | ------------------------------------------------------------- |
| `Session`          | One logged-in device or client installation.                  |
| `RefreshToken`     | One refresh-token value in a rotation chain.                  |
| `OtpChallenge`     | One email-authentication or OAuth-email proof.                |
| `OtpDeliveryQuota` | Persistent fixed-window counters for successful OTP delivery. |
| `AuthAccount`      | A Google or Apple identity linked to a user.                  |
| `AuditEvent`       | Append-only record of authentication and account activity.    |

Refresh tokens and OTP codes are never stored as plaintext. The database stores
HMACs.

## Session lifecycle

A successful login creates one `Session` and its first `RefreshToken`.
Refreshing creates another token row in the same session. Logging out marks the
session and its active refresh tokens revoked.

Available operations:

- `GET /v1/auth/me`
- `PATCH /v1/auth/me`
- `GET /v1/auth/sessions`
- `DELETE /v1/auth/sessions/:id`
- `POST /v1/auth/logout`
- `POST /v1/auth/logout-all`

The profile mutation accepts `firstName` and `lastName`. Contact identifiers
remain part of their verification flows and are not edited by this route.

Refresh rotation and replay handling are documented in
[refresh-rotation.md](./refresh-rotation.md).

## User deletion

`DELETE /v1/auth/me` deletes the user and relies on database relations:

| Relation       | Delete behavior        |
| -------------- | ---------------------- |
| Sessions       | Cascade                |
| Refresh tokens | Cascade                |
| OTP challenges | Cascade                |
| OAuth accounts | Cascade                |
| Audit events   | Set `userId` to `NULL` |

Audit history remains available after account deletion. Projects with stricter
retention requirements must add their own audit-purge policy.

## Audit event types

The accepted event names live in
[`audit.types.ts`](../../apps/api/src/audit/audit.types.ts).

| Event                 | Meaning                                    |
| --------------------- | ------------------------------------------ |
| `SIGNUP`              | A new user was created.                    |
| `EMAIL_VERIFIED`      | Email ownership was verified.              |
| `LOGIN_SUCCESS`       | Authentication completed successfully.     |
| `LOGIN_FAIL`          | An authentication attempt failed.          |
| `OAUTH_LINKED`        | A provider identity was linked.            |
| `OAUTH_UNLINKED`      | A provider identity was removed.           |
| `SESSION_REVOKED`     | A session was logged out or revoked.       |
| `SESSION_BURNED`      | Refresh-token reuse invalidated a session. |
| `LOGOUT_ALL`          | All user sessions were revoked.            |
| `ACCOUNT_DELETED`     | A user deleted their account.              |
| `NEW_DEVICE_NOTIFIED` | A new-device notification was recorded.    |

`SESSION_BURNED` and `NEW_DEVICE_NOTIFIED` are part of the accepted vocabulary,
but the current application does not emit them yet.

Audit recording is best-effort: a logging failure does not turn a successful
authentication operation into a failed one.

## Cleanup

When `AUTH_CLEANUP_ENABLED=true`, a daily 03:00 job deletes:

- Expired refresh-token rows
- OTP challenges more than seven days past expiry
- Expired OTP quota windows
- Sessions revoked more than 30 days ago

Audit events are not deleted by this job.
