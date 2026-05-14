# Agent prompt — SMS OTP module + SMSO.ro adapter (PR 11)

> Copy everything between the fences and paste into a new Claude Code session, **with the agent spawned via `isolation: "worktree"` from `main`**. Do not run two of these against the same worktree.

---

You are implementing the SMS-OTP auth method for `apps/api` along with the SMSO.ro production adapter. Read `docs/plan/parallel-agents/_shared-context.md` and `AGENTS.md` end-to-end before writing any code. Those two files define the conventions, the import patterns, the test patterns, and the file-level constraints — every rule there is binding.

## Scope

Two pieces of work, both in this PR:

1. **`SmsOtpModule`** — two endpoints under `/v1/auth/sms-otp/...` that mirror the email-OTP flow, but key on phone numbers.
2. **`SmsoSmsService`** — a production-ready implementation of `SmsService` that calls SMSO.ro's HTTP API.

### Endpoints

- `POST /v1/auth/sms-otp/request` (public, throttled)
  - Body: `{ phone }` (E.164, validated by `v1.common.phoneSchema`).
  - On success (always, even if phone unknown): 202 with `{ status: "sent" }`. Anti-enumeration contract — same shape regardless.
  - Side effects when the phone matches a real `User`:
    - Insert a fresh `OtpToken` row with `channel: "SMS"`, `purpose: "AUTH"`, `codeHash`, `expiresAt`, `attemptsCount: 0`, `used: false`.
    - Send the code via `SmsService.send(...)`.
  - When the phone is unknown:
    - Still wait the same amount of time the success path takes (constant-time response).
    - Do **not** insert any row, do **not** send anything.

- `POST /v1/auth/sms-otp/verify` (public, throttled)
  - Body: `{ phone, code }`.
  - Happy path: locate the user, find the most recent unused non-expired `OtpToken` for `(user, SMS, AUTH)`, constant-time-compare hashes. If match: mark `used: true`, set `User.phoneVerified = now` if currently null, call `coreAuth.issueSession`, write cookies, return `TokenPair`.
  - Wrong code: increment `attemptsCount`. When `>= env.OTP_MAX_ATTEMPTS`, refuse all further attempts on that row.
  - Expired or missing row: 401 with a generic "invalid or expired code" message.

### OTP code generation

Same rule as email-OTP: in `NODE_ENV !== "production"` the code is `"000000"`; in production it's `env.OTP_LENGTH` crypto-random digits. Hash with `hashOtp(plaintext, env.OTP_HMAC_SECRET)`.

If the email-OTP agent has merged first and created `apps/api/src/auth/utils/otp-code.ts`, **reuse it**. If not, create that file yourself and flag it in `[INTEGRATION]` so the email-OTP PR can be rebased to share.

### SMSO.ro adapter

SMSO.ro is the production SMS provider. The interface is in [`apps/api/src/sms/sms.service.ts`](../../../apps/api/src/sms/sms.service.ts):

```ts
export abstract class SmsService {
  abstract send(message: { to: string; body: string }): Promise<void>;
}
```

`LogSmsService` and `SpySmsService` already exist in [`apps/api/src/sms/impls/`](../../../apps/api/src/sms/impls/). You add `SmsoSmsService` next to them.

#### SMSO.ro API

- Endpoint: `POST https://api.smso.ro/messages` (or whichever URL is documented; **check the latest SMSO.ro API docs** before writing the client — don't rely on training data).
- Auth: `Authorization: Bearer <env.SMSO_API_KEY>` (verify the exact header per the docs).
- Body shape per the latest docs.
- Use `globalThis.fetch` (Node 18+) — don't add a dedicated HTTP library.
- On non-2xx: throw a clear error so the audit/log shows the failure; do NOT silently swallow.

#### Wiring SMSO into `SmsModule`

`SmsModule` has a `forRoot()` or similar that picks the impl based on `env.SMS_PROVIDER`. Read it before changing. The pattern is the same as `MailerModule` if that exists. Add the new branch:

```ts
if (env.SMS_PROVIDER === "smso") return SmsoSmsService;
```

Cross-field env rules (`SMSO_API_KEY` + `SMSO_SENDER` required when `SMS_PROVIDER=smso`) are already enforced in [`env.ts`](../../../apps/api/src/config/env.ts).

### Files to create

```
apps/api/src/auth/modules/sms-otp/
├── sms-otp.module.ts
├── sms-otp.service.ts
├── sms-otp.controller.ts
└── dto/
    ├── sms-otp-request.dto.ts             # extends createZodDto(v1.auth.smsOtpRequestSchema)
    └── sms-otp-verify.dto.ts              # extends createZodDto(v1.auth.smsOtpVerifySchema)

apps/api/src/sms/impls/
├── smso-sms.service.ts                    # production SMSO.ro adapter
└── smso-sms.service.spec.ts               # unit test mocking fetch — verifies request shape + error handling

apps/api/src/auth/utils/
└── otp-code.ts                            # ONLY IF the email-OTP agent didn't create it first

packages/api-shared/src/v1/auth/
└── sms-otp.schemas.ts                     # smsOtpRequestSchema, smsOtpVerifySchema

apps/api/test/
└── sms-otp.e2e-spec.ts                    # request/verify happy + sad paths, 5-wrong-attempts, expired, throttler
```

### Schemas

```ts
// packages/api-shared/src/v1/auth/sms-otp.schemas.ts
import { z } from "zod";
import { otpCodeSchema, phoneSchema } from "../common/common.schemas";

export const smsOtpRequestSchema = z
  .object({ phone: phoneSchema })
  .strict()
  .meta({ id: "SmsOtpRequest" });

export const smsOtpVerifySchema = z
  .object({ phone: phoneSchema, code: otpCodeSchema })
  .strict()
  .meta({ id: "SmsOtpVerify" });

export type SmsOtpRequestInput = z.infer<typeof smsOtpRequestSchema>;
export type SmsOtpVerifyInput = z.infer<typeof smsOtpVerifySchema>;
```

### Throttler

Same buckets as email-OTP. See `_shared-context.md` for the `@Throttle({...})` snippet.

### Audit events

- `LOGIN_SUCCESS` — every successful verify. `meta: { method: "sms-otp" }`.
- `SIGNUP` — first-time successful verify for a user with no prior `LOGIN_SUCCESS`.
- `LOGIN_FAIL` — wrong code / expired / unknown phone. `meta: { method: "sms-otp", reason }`.

No new event types should be needed. If you decide you do need one, append to [`apps/api/src/audit/audit.types.ts`](../../../apps/api/src/audit/audit.types.ts) and flag in `[INTEGRATION]`.

### Tests (e2e)

Use the spy SMS service (`SpySmsService`) injected via the test module — never call SMSO.ro from tests.

Minimum coverage:

1. Request happy path: unknown phone → 202 with `status: "sent"`. No `OtpToken` row. Spy has zero messages.
2. Request happy path: known phone → 202. One fresh `OtpToken` row. Spy has exactly one message to that phone.
3. Verify happy path (non-prod): `code="000000"` → 200 with `TokenPair`. `OtpToken.used=true`. New `Session` row.
4. Verify happy path: confirms `User.phoneVerified` is set if previously null.
5. Verify wrong code 5 times → row's `attemptsCount === 5`, sixth attempt returns 401 without re-checking.
6. Verify expired → 401 with the generic message.
7. Verify unknown phone → 401 with the generic message; constant-time-ish.
8. Throttler: 21 `/request` calls from same IP in an hour → 429.
9. Unit test for `SmsoSmsService` mocks `globalThis.fetch` and verifies the request URL, headers, and body shape match SMSO.ro's documented contract.

### Module wiring

```ts
@Module({
  imports: [UsersModule],
  controllers: [SmsOtpController],
  providers: [SmsOtpService],
})
export class SmsOtpModule {}
```

Inject `CoreAuthService`, `PrismaService`, `SmsService`, `AuditService`, `@Inject(ENV) env`.

### Doc to write

If `docs/auth/otp.md` exists (created by the email-OTP agent), amend it with a section on SMS-OTP specifics (phone normalization, SMSO.ro details, channel discrimination). If not, create it covering both channels.

Add a separate `docs/auth/sms-provider.md` covering the SMSO.ro adapter: env config, expected behavior, error handling.

## Allowed shared-file edits (mention each in `[INTEGRATION]`)

- `packages/api-shared/src/v1/auth/index.ts` — `export * from "./sms-otp.schemas";`
- `apps/api/src/auth/auth.module.ts` — note the line PR 6 will need: `if (env.AUTH_SMS_OTP_ENABLED) imports.push(SmsOtpModule);`
- `apps/api/src/sms/sms.module.ts` — add the `SmsoSmsService` branch in `forRoot()` (or whatever the impl-selection pattern is).
- `apps/api/src/audit/audit.types.ts` — only if you added a new type.
- `CHANGELOG.md` — append "Added — PR 11 (SMS OTP module + SMSO.ro adapter)" under "Unreleased".

## Definition of done

- [ ] All files listed above created.
- [ ] `pnpm --filter @repo/api-shared build` succeeds.
- [ ] `pnpm --filter api check-types` clean.
- [ ] `pnpm --filter api test` and `pnpm --filter api test:e2e` both pass.
- [ ] `pnpm gen` succeeds and `openapi.json` contains `SmsOtpRequest` + `SmsOtpVerify` schemas.
- [ ] Final message includes the `[INTEGRATION]` block.
- [ ] Branch committed with `feat(auth/sms-otp): ...`.

If you get stuck, ask the user — don't guess. Don't reduce scope without explicit approval.
