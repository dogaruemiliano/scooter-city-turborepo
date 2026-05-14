# ADR 0005 — Pluggable mailer and SMS impls

- **Status:** Accepted
- **Date:** 2026-05-14
- **Deciders:** template author

## Context

The auth subsystem needs to send email (OTP, future new-device notifications) and SMS (OTP). Different downstream projects spawned from this template will pick different providers — some will use Resend, some will already have an SMTP relay, some will have nothing in production yet and just want logs. SMS is similar: SMSO.ro is the chosen production provider for this template, but a project that ships to a different region might swap in Twilio / MessageBird.

We need:

1. **One injection token per channel** so downstream code (`EmailOtpService`, future `NewDeviceNotifier`) is provider-agnostic.
2. **Provider chosen at runtime via env** so flipping `MAILER_PROVIDER=resend → smtp` is a redeploy, not a code change.
3. **No throw-on-startup when credentials for an unselected provider are missing** — `MAILER_PROVIDER=log` must not require `RESEND_API_KEY` or `SMTP_HOST`.
4. **E2E tests can swap a spy in without going through env** — overriding the abstract token with a test class.

## Decision

Each channel is a Nest abstract class used as both type and DI token, with multiple `@Injectable()` implementations under `impls/`. The module exposes a `forRoot(env)` factory that registers **only** the impl selected by `env.<CHANNEL>_PROVIDER`. Tests bypass the factory by overriding the abstract token:

```ts
Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(MailerService)
  .useClass(SpyMailerService)
  .compile();
```

### Mailer

```
apps/api/src/mailer/
├── mailer.module.ts       # @Global, forRoot(env) picks the impl
├── mailer.service.ts      # abstract MailerService + MailerMessage type
└── impls/
    ├── log-mailer.service.ts      # MAILER_PROVIDER=log (default)
    ├── resend-mailer.service.ts   # MAILER_PROVIDER=resend
    ├── smtp-mailer.service.ts     # MAILER_PROVIDER=smtp
    └── spy-mailer.service.ts      # test-only; never registered by forRoot
```

### SMS

```
apps/api/src/sms/
├── sms.module.ts
├── sms.service.ts
└── impls/
    ├── log-sms.service.ts         # SMS_PROVIDER=log
    ├── smso-sms.service.ts        # SMS_PROVIDER=smso (PR 11)
    └── spy-sms.service.ts         # test-only
```

### Env-validated cross-field rules

The zod env schema's `superRefine` enforces that the selected provider's credentials are present. Examples (see [`apps/api/src/config/env.ts`](../../apps/api/src/config/env.ts)):

```
MAILER_PROVIDER=resend  →  RESEND_API_KEY required
MAILER_PROVIDER=smtp    →  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD required
SMS_PROVIDER=smso       →  SMSO_API_KEY, SMSO_SENDER required
```

These run once at app boot; a misconfiguration aborts the process before any traffic arrives.

## Reasoning

1. **Single injection token per channel.** Auth modules inject `MailerService` and don't know or care which impl is wired in. Adding `SesMailerService` later is a one-line change in `forRoot`'s switch + a new impl file — no consumer touches.

2. **`forRoot(env)` over factory-with-conditional-providers.** An earlier draft pre-registered every impl as a provider and used `useFactory: (env, log, resend, smtp) => env.MAILER_PROVIDER === ...`. That worked but had a sharp edge: the unselected impls' constructors still ran. `ResendMailerService.constructor` validates `env.RESEND_API_KEY` and throws if missing, which would break `MAILER_PROVIDER=log` in any environment that hadn't bothered to set Resend credentials. `forRoot(env)` registers exactly one impl class, so the others never instantiate.

3. **No `forRootAsync` with `inject: [ENV]`.** That pattern requires the Nest container to be partially constructed before module shape is decided, which complicates the import graph. Reading the env synchronously at module-graph build time (`loadEnv()` is called once in `app.module.ts`) is simpler and gives the same dynamism.

4. **`@Global()` on each module.** Mailer and SMS are genuinely cross-cutting — every auth-method module that lands (email-OTP, future password reset, new-device email) needs the mailer; SMS-OTP needs SMS. Marking the modules global avoids forcing each method module to import them locally.

5. **Tests stay simple.** `overrideProvider(MailerService).useClass(SpyMailerService)` works regardless of which env-selected impl `forRoot` chose — the override applies after `AppModule` is composed. The spy never appears in the env's provider switch, so production code paths can't accidentally select it.

## Trade-offs accepted

- **Module config is read once at boot.** Changing `MAILER_PROVIDER` requires a process restart. This is a deliberate constraint — runtime swapping would require a layer of indirection (a `MailerRouter` that re-reads env on every send) for very little gain.

- **Each impl owns its own validation.** `ResendMailerService.constructor` throws when its env is missing even though the env schema's `superRefine` already caught that case. The redundancy is intentional: an impl class that's instantiable with bad input would silently no-op or throw deep in `send()` — neither of which is as clear as a constructor failure with the actual cause.

- **`SmtpMailerService` doesn't pool.** Default `nodemailer` transporter is unpooled. Auth-flow mail volume (OTPs + new-device emails) is tiny and pooling complicates `onModuleDestroy`. If a downstream project blasts marketing email through this module, it should subclass with `pool: true` rather than us pre-optimizing.

## What we explicitly rejected

- **A single concrete `MailerService` that switches on env per-`send()`.** That's where the `MAILER_PROVIDER` env value would ship to a hot-path branch. The redundant work of constructing the right transport per send plus the `if/else` repeated on every call is worse than the upfront one-time selection.

- **Per-app provider configuration via decorators (`@UseProvider("resend")` on a controller).** Auth flows never need per-route provider choice — every project picks exactly one provider per channel. Adding a per-route mechanism is feature creep with no caller.

- **`MailerService` as a TypeScript `interface` plus a separate DI token symbol.** Using the abstract class as both the type and the token simplifies the consumer signature (`constructor(private mailer: MailerService)` Just Works) at no cost — abstract classes are tree-shakable in TS the same as interfaces.

## Consequences

- Every new mailer / SMS provider follows the same recipe: one file under `impls/`, one switch arm in `forRoot`, one env-flag-branch in `superRefine`.
- Tests that need to assert "an email was sent" override the abstract token with the spy — independent of what production env says.
- Downstream template consumers who only need a single provider can delete the impls they don't use without touching consumer code. The unselected `case` in `forRoot` becomes dead and can be removed.

## Related ADRs

- [ADR 0002](./0002-cookie-based-sessions.md) — sessions and cookies (consumes the mailer for OTP delivery).
- [ADR 0003](./0003-multi-instance-refresh-rotation.md) — rotation (doesn't touch the mailer directly).

## Open follow-ups

- Webhook-based delivery receipts (`message.delivered`, `message.bounced` from Resend / SMSO). Useful for the new-device email but out of scope until at least one method module ships in production.
- Background queue for outbound mail (BullMQ on Redis) — only relevant if API request handlers start blocking on slow SMTP relays. Auth flows don't, today.
