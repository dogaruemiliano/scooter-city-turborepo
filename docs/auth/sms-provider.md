# SMS provider (SMSO.ro)

The API delivers SMS one-time codes via a swappable
[`SmsService`](../../apps/api/src/sms/sms.service.ts) DI token. The
concrete implementation is picked at module-registration time from
`env.SMS_PROVIDER`:

| `SMS_PROVIDER` | Implementation                                                       | When                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `log`          | [`LogSmsService`](../../apps/api/src/sms/impls/log-sms.service.ts)   | Local dev & non-prod. Logs the SMS to stdout via pino.                                                                                                  |
| `smso`         | [`SmsoSmsService`](../../apps/api/src/sms/impls/smso-sms.service.ts) | Production. Sends through [SMSO.ro](https://app.smso.ro).                                                                                               |
| —              | [`SpySmsService`](../../apps/api/src/sms/impls/spy-sms.service.ts)   | E2E tests only — overridden via `Test.createTestingModule(...).overrideProvider(SmsService).useClass(SpySmsService)`. Never selected by `SMS_PROVIDER`. |

The env validator (see [`apps/api/src/config/env.ts`](../../apps/api/src/config/env.ts))
forbids `SMS_PROVIDER=log` in production when `AUTH_SMS_OTP_ENABLED=true`.

## Configuration

```env
# Required when SMS-OTP is enabled
AUTH_SMS_OTP_ENABLED=true

# log | smso
SMS_PROVIDER=smso

# Required when SMS_PROVIDER=smso (cross-field rule enforced in env.ts)
SMSO_API_KEY=…
SMSO_SENDER=YourBrand     # 3–11 chars, alphanumeric, no spaces (SMSO sender-ID rules)
```

`SMSO_SENDER` is the alphanumeric sender ID shown on the recipient's
phone. It must be pre-registered with SMSO.ro before it can be used —
unregistered senders are silently rewritten to a numeric shortcode.

## SMSO.ro HTTP contract

Verified against [https://api-docs.smso.ro/](https://api-docs.smso.ro/).
If the adapter ever stops working, re-check the live docs before
debugging — SMSO publishes breaking changes to that page.

| Field              | Value                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| URL                | `POST https://app.smso.ro/api/v1/send`                                                     |
| Auth header        | `X-Authorization: <SMSO_API_KEY>` (not `Bearer`, not `Authorization`)                      |
| `Content-Type`     | `application/json`                                                                         |
| Body               | `{ "sender": "<SMSO_SENDER>", "to": "<E.164>", "body": "<text>", "type": "otp" }`          |
| Success            | `200` with `{ "status": 200, "responseToken": "…", "transaction_cost": <number> }`         |
| Failure (HTTP)     | Any non-2xx                                                                                |
| Failure (envelope) | `200` with `status !== 200` in the JSON body (rare, but happens for downstream rejections) |

### `type: "otp"`

The `type` field flags transactional one-time codes. SMSO routes those
through deliverability paths that bypass marketing-opt-out filters and
get prioritized over bulk traffic. We always send `"otp"` because every
message this adapter ever sends is a one-time code — there is no
marketing path through this transport.

### Error handling

The adapter throws a typed `Error` on:

- Non-2xx HTTP status. Error includes the SMSO HTTP code and up to the
  first 512 chars of the response body so the cause is visible in the
  audit log without dumping arbitrary HTML.
- 200 HTTP with `status !== 200` in the JSON envelope. SMSO occasionally
  returns a 200 wrapper around a downstream rejection (e.g. 403
  blacklisted content). The adapter surfaces these as errors.

Notable SMSO status codes worth recognizing in alerts:

| SMSO `status` | Meaning                             | Action                                        |
| ------------- | ----------------------------------- | --------------------------------------------- |
| 200           | Success                             | —                                             |
| 400           | Malformed request                   | Bug — re-check body shape against the docs    |
| 401           | Bad API key                         | Rotate `SMSO_API_KEY`                         |
| 402           | Insufficient credit                 | Top up the SMSO account                       |
| 403           | Blacklisted content                 | Adjust template; check sender registration    |
| 405           | Recipient opted out                 | Soft-fail — user blocked SMS from this sender |
| 409           | Provider rate limit hit             | Back off; retry policy is caller-side         |
| 422           | International messaging not enabled | Enable in SMSO console for the route          |

### No retries inside the adapter

The adapter does not retry on its own. Reason: `/v1/auth/sms-otp/request`
is idempotent from the caller's perspective — re-requesting just issues
a new code — so retry policy belongs at the call site (or operator
level), not buried in the SMS layer where it would amplify provider
rate-limit hits.

## DI / module wiring

[`SmsModule`](../../apps/api/src/sms/sms.module.ts) is `@Global()`. It
registers `LogSmsService` unconditionally and `SmsoSmsService`
conditionally (only when `process.env.SMS_PROVIDER === "smso"`, read at
module-construction time before DI is wired). A factory selects the
right impl into the abstract `SmsService` token based on `env.SMS_PROVIDER`.

The conditional registration matters: `SmsoSmsService`'s constructor
validates `SMSO_API_KEY` + `SMSO_SENDER`. Eagerly registering it on
`SMS_PROVIDER=log` would throw on dev boot because the keys are absent.

## Testing

- Unit tests for the adapter mock `globalThis.fetch` and assert URL,
  headers, and body shape against the SMSO contract. See
  [`smso-sms.service.spec.ts`](../../apps/api/src/sms/impls/smso-sms.service.spec.ts).
- E2E tests override the `SmsService` provider with `SpySmsService` —
  never call SMSO from tests. See
  [`sms-otp.e2e-spec.ts`](../../apps/api/test/sms-otp.e2e-spec.ts).

## Why SMSO.ro specifically

Romanian operator with strong local deliverability on RO mobile
networks. Cheaper than international SMS gateways for RO numbers, and
the `X-Authorization` API is straightforward. If we expand outside RO,
swap to Twilio or a multi-region provider — add a new
`SmsService` impl, route it via `env.SMS_PROVIDER`, no changes to the
auth-method code.

## See also

- OTP flow design (channel-agnostic): [`docs/auth/otp.md`](otp.md)
- Rate limits: [`docs/auth/rate-limiting.md`](rate-limiting.md)
- ADR on pluggable mailer/SMS layer: [`docs/adr/0005-pluggable-mailer-sms.md`](../adr/0005-pluggable-mailer-sms.md)
