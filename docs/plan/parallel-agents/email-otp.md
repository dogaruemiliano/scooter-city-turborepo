# Agent prompt — Email OTP module (PR 8)

> Copy everything between the fences and paste into a new Claude Code session, **with the agent spawned via `isolation: "worktree"` from `main`**. Do not run two of these against the same worktree.

---

You are implementing the Email-OTP auth method for `apps/api`. Read `docs/plan/parallel-agents/_shared-context.md` and `AGENTS.md` end-to-end before writing any code. Those two files define the conventions, the import patterns, the test patterns, and the file-level constraints — every rule there is binding.

## Scope

Build `EmailOtpModule`: two endpoints under `/v1/auth/email-otp/...` that issue a single-use 6-digit code by email and exchange a valid code for a fresh session.

### Endpoints

- `POST /v1/auth/email-otp/request` (public, throttled)
  - Body: `{ email }`
  - On success (always, even if email unknown): 202 with `{ status: "sent" }`. The constant response is the anti-enumeration contract — see `_shared-context.md`.
  - Side effects when the email matches a real `User`:
    - Insert a fresh `OtpToken` row with `channel: "EMAIL"`, `purpose: "AUTH"`, `codeHash`, `expiresAt`, `attemptsCount: 0`, `used: false`.
    - Send the code via `MailerService.send(...)`.
  - When the email is unknown:
    - Still wait the same amount of time the success path takes (constant-time response).
    - Do **not** insert any row, do **not** send any mail.

- `POST /v1/auth/email-otp/verify` (public, throttled)
  - Body: `{ email, code }`
  - Happy path: locate the user, find the most recent unused non-expired `OtpToken` for `(user, EMAIL, AUTH)`, constant-time-compare hashes. If match: mark `used: true`, set `User.emailVerified = now` if currently null (emit `EMAIL_VERIFIED` audit event in that case), call `coreAuth.issueSession`, write cookies, return `TokenPair`.
  - Wrong code: increment `attemptsCount` on the matched row. When `attemptsCount >= env.OTP_MAX_ATTEMPTS`, refuse all further attempts on that row (401 with a generic "invalid or expired code" message).
  - Expired or missing row: 401 with the same generic message — never disambiguate.

### OTP code generation

In `NODE_ENV !== "production"`, the code is literally `"000000"`. In production, generate `env.OTP_LENGTH` crypto-random digits using `node:crypto`. Hash with `hashOtp(plaintext, env.OTP_HMAC_SECRET)` before persisting.

If you create a shared helper at `apps/api/src/auth/utils/otp-code.ts`, mention it in your `[INTEGRATION]` so the SMS-OTP agent's PR can reuse it instead of reimplementing.

### Files to create

```
apps/api/src/auth/modules/email-otp/
├── email-otp.module.ts
├── email-otp.service.ts
├── email-otp.controller.ts
└── dto/
    ├── email-otp-request.dto.ts        # extends createZodDto(v1.auth.emailOtpRequestInputSchema)
    ├── email-otp-verify.dto.ts         # extends createZodDto(v1.auth.emailOtpVerifySchema)
    └── responses.ts                    # OtpRequestResponse, TokenPair already exists

packages/api-shared/src/v1/auth/
└── email-otp.schemas.ts                # emailOtpRequestInputSchema, emailOtpVerifySchema

apps/api/test/
├── email-otp.e2e-spec.ts               # request/verify happy + sad paths, 5-wrong-attempts, expired, throttler
└── email-otp.service.spec.ts           # service-level if non-trivial

docs/auth/
└── otp.md                              # OTP design (code generation, hashing, dev bypass, anti-enum)
```

### Schemas (in `packages/api-shared/src/v1/auth/email-otp.schemas.ts`)

```ts
import { z } from "zod";
import { emailSchema, otpCodeSchema } from "../common/common.schemas";

export const emailOtpRequestInputSchema = z
  .object({ email: emailSchema })
  .strict()
  .meta({ id: "EmailOtpRequest" });

export const emailOtpVerifySchema = z
  .object({ email: emailSchema, code: otpCodeSchema })
  .strict()
  .meta({ id: "EmailOtpVerify" });

export type EmailOtpRequestInput = z.infer<typeof emailOtpRequestInputSchema>;
export type EmailOtpVerifyInput = z.infer<typeof emailOtpVerifySchema>;
```

### Throttler

`POST /request` is the hot abuse target. Apply:

```ts
@Throttle({
  "otp-ip":           { limit: env.THROTTLE_OTP_PER_IP_PER_HOUR,     ttl: 3_600_000 },
  "otp-target":       { limit: env.THROTTLE_OTP_PER_TARGET_PER_HOUR, ttl: 3_600_000 },
  "otp-target-daily": { limit: env.THROTTLE_OTP_PER_TARGET_PER_DAY,  ttl: 86_400_000 },
})
```

`POST /verify` gets only the `otp-ip` bucket (to slow attempt-spraying across emails) plus the existing `OTP_MAX_ATTEMPTS` per-row counter.

### Audit events

Emit on `verify` happy path:

- `EMAIL_VERIFIED` — only if you flipped `User.emailVerified` for the first time. `meta: { method: "email-otp" }`.
- `LOGIN_SUCCESS` — every successful verify. `meta: { method: "email-otp" }`.
- `SIGNUP` — emit when the row's pre-verify state had `User.emailVerified === null` AND no prior `LOGIN_SUCCESS` for this user. (i.e. this is their first time fully signing in.) Use a `prisma.auditEvent.count` to check.

Emit on wrong code, expired, or unknown email:

- `LOGIN_FAIL` — `meta: { method: "email-otp", reason: "invalid-code" | "expired" | "unknown-email" }`.

No new event types should be needed. If you decide you do need one (e.g. `EMAIL_OTP_REQUESTED`), append it to [`apps/api/src/audit/audit.types.ts`](../../../apps/api/src/audit/audit.types.ts) and flag in `[INTEGRATION]`.

### Tests (e2e, against real Postgres)

Minimum coverage:

1. Request happy path: unknown email → 202 with `status: "sent"`. No `OtpToken` row. Spy mailer has zero messages.
2. Request happy path: known email → 202. One fresh `OtpToken` row (channel=EMAIL, purpose=AUTH, attemptsCount=0, used=false). Spy mailer has exactly one message to that email.
3. Verify happy path (non-prod): `code="000000"` returns 200 with `TokenPair`. Cookies set. `OtpToken.used=true`. New `Session` row exists.
4. Verify happy path: confirms `User.emailVerified` gets set if previously null + audit emits `EMAIL_VERIFIED` + `LOGIN_SUCCESS`.
5. Verify wrong code 5 times → row's `attemptsCount === 5`, returns 401 each time, sixth attempt returns 401 without re-checking.
6. Verify expired: manually backdate the row's `expiresAt` past now → 401 with the generic message.
7. Verify unknown email → 401 with the same generic message. Constant-time-ish: response time within 50% of the happy path.
8. Throttler: 21 `/request` calls from the same IP in an hour → 21st returns 429. (Set `env.THROTTLE_OTP_PER_IP_PER_HOUR=20` in test setup.)

### Module wiring

```ts
@Module({
  imports: [UsersModule], // for UsersService
  controllers: [EmailOtpController],
  providers: [EmailOtpService],
})
export class EmailOtpModule {}
```

Inject `CoreAuthService` from the `CoreAuthModule` re-export (already exported by `AuthModule.forRoot()`), `PrismaService`, `MailerService`, `AuditService`, `@Inject(ENV) env`.

### Doc to write — `docs/auth/otp.md`

Cover: OTP generation (the `"000000"` dev bypass, why purely `NODE_ENV`-derived, no separate flag), hashing (`hashOtp` + secret), the attempts counter, expiry, anti-enumeration, throttler buckets, audit emissions. Link to schemas and to the e2e spec.

## Allowed shared-file edits (mention each in `[INTEGRATION]`)

- `packages/api-shared/src/v1/auth/index.ts` — `export * from "./email-otp.schemas";`
- `apps/api/src/auth/auth.module.ts` — note the line PR 6 will need.
- `apps/api/src/audit/audit.types.ts` — only if you added a new type.
- `CHANGELOG.md` — append "Added — PR 8 (Email OTP module)" under "Unreleased".

## Definition of done

- [ ] All files listed above created.
- [ ] `pnpm --filter @repo/api-shared build` succeeds.
- [ ] `pnpm --filter api check-types` clean.
- [ ] `pnpm --filter api test` and `pnpm --filter api test:e2e` both pass (your new tests + every existing test).
- [ ] `pnpm gen` succeeds and `openapi.json` now contains `EmailOtpRequest` + `EmailOtpVerify` schemas.
- [ ] Final message includes the `[INTEGRATION]` block.
- [ ] Branch committed with `feat(auth/email-otp): ...`.

If you get stuck, ask the user — don't guess. Don't reduce scope without explicit approval.
