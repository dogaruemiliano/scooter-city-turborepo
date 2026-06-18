# ADR 0005 — SMTP mailer and pluggable SMS implementations

- **Status:** Accepted
- **Date:** 2026-05-14
- **Updated:** 2026-06-12
- **Deciders:** template author

## Context

The auth subsystem sends email OTPs. Email delivery is standardized on
authenticated SMTP so the same implementation works with hosted SMTP relays
and transactional-email services that expose an SMTP endpoint.

SMS authentication has been removed. The general SMS transport remains available
for future phone verification and application notifications. The template
provides SMSO.ro for real delivery and a log implementation for development.

## Decision

`MailerService` remains the provider-agnostic injection token consumed by auth
features, but `MailerModule` always binds it to `SmtpMailerService`.

```text
apps/api/src/mailer/
├── mailer.module.ts
├── mailer.service.ts
└── impls/
    ├── smtp-mailer.service.ts
    └── spy-mailer.service.ts
```

SMTP requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD`.
Unauthenticated SMTP is intentionally unsupported so development, test, and
production exercise the same transport configuration.

Tests override the abstract token with `SpyMailerService`:

```ts
Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(MailerService)
  .useClass(SpyMailerService)
  .compile();
```

SMS uses an abstract contract with separate implementations:

```text
apps/api/src/sms/
├── sms.module.ts
├── sms.service.ts
└── impls/
    ├── log-sms.service.ts
    ├── smso-sms.service.ts
    └── spy-sms.service.ts
```

`SmsModule.forRoot(env)` registers exactly one implementation under the
`SmsService` token. `SMS_PROVIDER=log` selects `LogSmsService`;
`SMS_PROVIDER=smso` selects `SmsoSmsService` and requires `SMSO_API_KEY` and
`SMSO_SENDER`.

`SmsModule` is infrastructure, not an authentication method. Enabling an SMS
provider does not add any `/v1/auth` route.

## Reasoning

1. SMTP is a stable interoperability boundary and avoids coupling the template
   to a proprietary email SDK.
2. One mail implementation removes provider-selection branches, credentials
   for unused providers, and additional dependencies.
3. The abstract `MailerService` keeps auth features testable and independent of
   Nodemailer.
4. A global module remains appropriate because email delivery is cross-cutting.
5. The abstract `SmsService` keeps callers independent from SMSO and allows
   tests to replace delivery with `SpySmsService`.
6. Registering only the selected implementation prevents unused constructors
   from validating irrelevant credentials.
7. The explicit log implementation permits local testing without network calls.

## Trade-offs

- Projects that require a proprietary email API must replace the SMTP
  implementation themselves.
- The Nodemailer transport is intentionally unpooled because auth email volume
  is low.
- SMTP configuration is read at process startup; changes require an API
  restart.
- SMS implementation selection happens once at process startup; changing
  `SMS_PROVIDER` requires a restart.
- Supporting another real provider requires a new `SmsService` implementation
  and one additional selection branch in `SmsModule.forRoot()`.

## Local Development

Point the API at an SMTP relay or local capture service configured with SMTP
authentication:

```env
MAILER_FROM=no-reply@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=local-user
SMTP_PASSWORD=local-password
```

## Related ADRs

- [ADR 0002](./0002-cookie-based-sessions.md)
- [ADR 0003](./0003-multi-instance-refresh-rotation.md)
