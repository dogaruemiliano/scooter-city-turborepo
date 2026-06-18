# SMS transport

The template exposes an abstract `SmsService` contract, but SMS authentication
has been removed. No current auth route sends SMS.

## Implementations

| `SMS_PROVIDER` | Implementation   | Use                         |
| -------------- | ---------------- | --------------------------- |
| `log`          | `LogSmsService`  | Local development and tests |
| `smso`         | `SmsoSmsService` | Real delivery through SMSO  |

`SpySmsService` is available for tests that need to inspect sent messages.

## Configuration

```env
SMS_PROVIDER=log

# Required only when SMS_PROVIDER=smso
SMSO_API_KEY=
SMSO_SENDER=
```

The environment schema validates SMSO credentials before application startup.

## Module wiring

`AppModule` passes the validated environment to `SmsModule.forRoot(env)`.
The dynamic module binds the abstract token directly to one implementation:

```ts
{
  provide: SmsService,
  useClass:
    env.SMS_PROVIDER === "smso" ? SmsoSmsService : LogSmsService,
}
```

Only the selected class is registered and constructed. Log mode therefore does
not instantiate `SmsoSmsService` or require SMSO credentials.

Feature tests can replace the same token with:

```ts
.overrideProvider(SmsService)
.useClass(SpySmsService)
```

## SMSO delivery

`SmsoSmsService` sends:

```http
POST https://app.smso.ro/api/v1/send
X-Authorization: <SMSO_API_KEY>
Content-Type: application/json
```

```json
{
  "sender": "<SMSO_SENDER>",
  "to": "<E.164 number>",
  "body": "<message>",
  "type": "otp"
}
```

It treats non-2xx HTTP responses and non-200 SMSO envelope statuses as errors.
It does not retry; callers own retry and idempotency policy.

The current implementation always sends `type: "otp"`. Review that
provider-specific field before using this transport for non-OTP notifications.

Apps generated from this template can replace `SmsoSmsService` or add another
implementation without changing callers.

Provider documentation: [SMSO API docs](https://api-docs.smso.ro/).
