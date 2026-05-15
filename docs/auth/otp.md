# OTP design (email + SMS)

This document covers the design of the API's one-time-code login flows.
PR 8 ships **email-OTP**; PR 11 adds **SMS-OTP** on the same patterns.
Everything below applies to both channels unless an "Email-only" /
"SMS-only" note carves out a difference. The channel-discriminating
column on `OtpToken` is `channel` (`"EMAIL"` or `"SMS"`); the
verification column on `User` is `emailVerified` for email, `phoneVerified`
for SMS.

The HTTP surface is two endpoints per channel:

| Endpoint                          | Auth   | Response                            |
| --------------------------------- | ------ | ----------------------------------- |
| `POST /v1/auth/email-otp/request` | Public | `202 { status: "sent" }`            |
| `POST /v1/auth/email-otp/verify`  | Public | `200 TokenPair` + cookies, or `401` |
| `POST /v1/auth/sms-otp/request`   | Public | `202 { status: "sent" }`            |
| `POST /v1/auth/sms-otp/verify`    | Public | `200 TokenPair` + cookies, or `401` |

Routes are versioned (`/v1`). Controllers:
[`EmailOtpController`](../../apps/api/src/auth/modules/email-otp/email-otp.controller.ts),
[`SmsOtpController`](../../apps/api/src/auth/modules/sms-otp/sms-otp.controller.ts).
SMS delivery is abstracted behind the [`SmsService`](../../apps/api/src/sms/sms.service.ts)
DI token — see [`sms-provider.md`](sms-provider.md) for the SMSO.ro
production adapter.

## Code generation

Codes are 6 digits (`env.OTP_LENGTH`, default 6) as a string — strings
preserve leading zeros (`001234` stays six characters).

- **Production (`NODE_ENV === "production"`)** — crypto-random digits via
  `node:crypto.randomBytes`. The generator (see
  [`apps/api/src/auth/utils/otp-code.ts`](../../apps/api/src/auth/utils/otp-code.ts))
  rejection-samples each byte to avoid modulo bias.
- **Non-production (`development`, `test`, anything else)** — always the
  literal `"000000"`. This is the **dev bypass**.

The bypass is keyed purely on `NODE_ENV` — no separate `OTP_DEV_BYPASS`
flag. Reason: any flag we add can be flipped wrong; tying the bypass to
`NODE_ENV` means promoting to production automatically promotes the OTP
generator. The dev OTP is the same value the
`@repo/api-shared` `otpCodeSchema` accepts in both worlds, so client
forms validate the literal `"000000"` without conditionals.

## Hashing

Plaintext OTPs never persist. Before insert, we compute
`hashOtp(code, OTP_HMAC_SECRET)` (HMAC-SHA-256, peppered) — see
[`apps/api/src/auth/utils/hash.ts`](../../apps/api/src/auth/utils/hash.ts).
On verify, the presented code is hashed the same way and compared with
[`safeEqualHex`](../../apps/api/src/auth/utils/hash.ts) (constant-time).

Why HMAC and not bcrypt: OTPs are high-entropy already (10^6 keyspace

- short TTL); bcrypt's slow-by-design property buys nothing here, only
  ~100ms of CPU per verify. Bcrypt stays for credentials — neither
  relevant here nor in scope for v1.

## The `OtpToken` row

One row per `(user, channel, purpose)` issuance — see
[`schema.prisma`](../../apps/api/prisma/schema.prisma).
The relevant columns:

| Column          | Notes                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| `userId`        | FK with `onDelete: Cascade`.                                                                  |
| `channel`       | `"EMAIL"` for email-OTP, `"SMS"` for SMS-OTP. Verify always filters by channel.               |
| `purpose`       | `"AUTH"` for login. (`"EMAIL_VERIFY"` reserved for the future stand-alone verification flow.) |
| `codeHash`      | HMAC-SHA-256 of the plaintext code.                                                           |
| `expiresAt`     | `now + OTP_TTL` (default 10 minutes).                                                         |
| `used`          | Flipped to `true` on successful verify.                                                       |
| `attemptsCount` | Incremented on every wrong-code verify. Locked at `OTP_MAX_ATTEMPTS` (default 5).             |

The verify endpoint always picks the **most recent unused** row for the
`(user, channel, AUTH)` tuple ordered by `createdAt DESC` — the channel
is `EMAIL` for `/email-otp/verify`, `SMS` for `/sms-otp/verify`. The two
channels share the table; they do not share rows. Older rows just sit
until the cleanup cron deletes them after `expiresAt`.

## Attempts counter

Wrong-code verifies bump `attemptsCount` on the matched row. Once
`attemptsCount >= OTP_MAX_ATTEMPTS`, every subsequent attempt on that
row is refused without re-checking the hash — even with the correct
code. This is the per-row brute-force defense; the per-IP throttler
(below) handles spraying across rows.

The counter resets only by creating a **new** row (i.e. calling
`/request` again). Lost code? Request another. There's no "reset
attempts" admin path.

## Expiry

`expiresAt = now + ms(env.OTP_TTL)` (default 10m). On verify, an
expired row is treated identically to a missing row — generic 401, no
disclosure.

## Anti-enumeration

The hard contract is: **the API must not disclose whether an email or
phone is registered**. Two paths matter:

### `/request`

- Returns `202 { status: "sent" }` unconditionally.
- If the email is unknown: no row inserted, no mail sent, but we still
  burn matched-latency work via
  `coreAuth.performDummyHashCompare()` (~100ms bcrypt cost) so the
  response time doesn't disclose the difference. This is approximate —
  real production mailers (Resend/SMTP) take ~50–200ms, so the dummy
  bcrypt is in the right ballpark. The dev `LogMailerService` is
  instantaneous, so under tests the unknown path is actually _slower_
  than the known path. That's the lesser leak — the meaningful threat
  is "unknown path returns instantly", which we defend against.

### `/verify`

- Every failure (unknown email, expired row, wrong code, locked row)
  returns the literal `401 "Invalid or expired code"` body. No
  discrimination on `WWW-Authenticate`, no different error codes, no
  hint in `details`.
- The unknown-email branch runs `performDummyHashCompare()` so its
  response time is in the same ballpark as the row-found branches.
- The e2e suite asserts a loose ratio ("within an order of magnitude")
  rather than a tight 50% window — system noise on a developer laptop
  swamps anything tighter, and tightening the assertion would just
  trade real signal for flakes.

## Throttler buckets

Configured at module level in
[`apps/api/src/auth/throttler.config.ts`](../../apps/api/src/auth/throttler.config.ts);
limits come from env (`THROTTLE_*`). The four named buckets:

| Bucket             | Limit env                          | Default | Apply to                                           |
| ------------------ | ---------------------------------- | ------- | -------------------------------------------------- |
| `otp-ip`           | `THROTTLE_OTP_PER_IP_PER_HOUR`     | 20/h    | every OTP route                                    |
| `otp-target`       | `THROTTLE_OTP_PER_TARGET_PER_HOUR` | 5/h     | `/request` (per email when a custom tracker lands) |
| `otp-target-daily` | `THROTTLE_OTP_PER_TARGET_PER_DAY`  | 20/d    | `/request` (same caveat)                           |
| `login-ip`         | `THROTTLE_LOGIN_PER_IP_PER_MIN`    | 10/min  | login endpoints (currently same key as OTP-IP)     |

All four named throttlers apply to every route by default — that's
`@nestjs/throttler`'s built-in behavior with multiple named
throttlers. We don't decorate per-route here: `env` is the single source
of truth and re-specifying per-route would invite drift.

**Known gap:** `otp-target` and `otp-target-daily` currently fall back
to IP keying. A request-body tracker (key on `body.email`) has not been
written yet. Under a single IP these buckets behave like extra
per-IP limits, not per-email limits. Documented in
[`docs/auth/rate-limiting.md`](rate-limiting.md).

In addition to the in-memory throttler, the per-row `attemptsCount`
counter (above) bounds /verify spraying on a single code.

## Audit emissions

[`AuditService`](../../apps/api/src/audit/audit.service.ts) writes one
`AuditEvent` row per emission. Email-OTP emits:

| Event            | When                                                                                                   | `meta`                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `LOGIN_SUCCESS`  | every successful `/verify`                                                                             | `{ method: "email-otp" }`                                                         |
| `EMAIL_VERIFIED` | `/verify` flips `User.emailVerified` from `null` for the first time                                    | `{ method: "email-otp" }`                                                         |
| `SIGNUP`         | `/verify` is the user's first-ever successful login (was unverified + zero prior `LOGIN_SUCCESS` rows) | `{ method: "email-otp" }`                                                         |
| `LOGIN_FAIL`     | `/verify` fails for any reason                                                                         | `{ method: "email-otp", reason: "unknown-email" \| "expired" \| "invalid-code" }` |

SMS-OTP emits the same audit types with `method: "sms-otp"`, minus the
`EMAIL_VERIFIED` row — no `PHONE_VERIFIED` event type exists yet (and
flipping `User.phoneVerified` is not separately auditable). If that
becomes a forensic gap, add `PHONE_VERIFIED` to [`audit.types.ts`](../../apps/api/src/audit/audit.types.ts)
in a follow-up.

The `reason` discriminator on `LOGIN_FAIL` is internal — it's never
echoed to the caller. It exists for the audit log so forensics can
distinguish "wrong code spraying" from "expired window" without
re-reading source.

## Cleanup

The daily 03:00 cron
([`AuthCleanupService`](../../apps/api/src/auth/cleanup/auth-cleanup.service.ts),
enabled by `AUTH_CLEANUP_ENABLED`) deletes `OtpToken` rows older than
`expiresAt`. Unused codes don't accumulate.

## See also

- Email request/verify schemas: [`packages/api-shared/src/v1/auth/email-otp.schemas.ts`](../../packages/api-shared/src/v1/auth/email-otp.schemas.ts)
- SMS request/verify schemas: [`packages/api-shared/src/v1/auth/sms-otp.schemas.ts`](../../packages/api-shared/src/v1/auth/sms-otp.schemas.ts)
- Email E2E spec: [`apps/api/test/email-otp.e2e-spec.ts`](../../apps/api/test/email-otp.e2e-spec.ts)
- SMS E2E spec: [`apps/api/test/sms-otp.e2e-spec.ts`](../../apps/api/test/sms-otp.e2e-spec.ts)
- SMS production transport: [`docs/auth/sms-provider.md`](sms-provider.md)
- Session lifecycle + the `EMAIL_VERIFIED` / `LOGIN_SUCCESS` audit types: [`docs/auth/sessions-and-audit.md`](sessions-and-audit.md)
- Throttler design: [`docs/auth/rate-limiting.md`](rate-limiting.md)
- Refresh-token rotation (consumed via `coreAuth.issueSession`): [`docs/auth/refresh-rotation.md`](refresh-rotation.md)
