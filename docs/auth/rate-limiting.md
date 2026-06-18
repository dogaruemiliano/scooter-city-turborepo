# Rate limiting and OTP delivery quotas

The API uses two separate controls because request-volume protection and email
abuse protection have different correctness requirements.

## Persistent OTP delivery quotas

`OtpDeliveryQuota` stores atomic fixed-window counters in PostgreSQL:

| Scope             | Window   | Default | Environment variable                     |
| ----------------- | -------- | ------- | ---------------------------------------- |
| Normalized target | UTC hour | 5       | `OTP_DELIVERY_QUOTA_PER_TARGET_PER_HOUR` |
| Normalized target | UTC day  | 20      | `OTP_DELIVERY_QUOTA_PER_TARGET_PER_DAY`  |
| Direct client IP  | UTC hour | 20      | `OTP_DELIVERY_QUOTA_PER_IP_PER_HOUR`     |

Initial codes, permitted resends, and post-expiry replacement challenges count.
Early resends do not count because they send no email.

The target and IP identifiers are HMAC-derived with `OTP_HMAC_SECRET` and
domain separation. The quota table stores no additional plaintext email or IP
fields. Email-authentication and OAuth email-verification deliveries share the
same target counters.

Quota reservation and challenge mutation run in the same Serializable
transaction. Concurrent requests cannot overrun the configured limit. SMTP
failures trigger a best-effort transaction that restores the challenge
delivery state and releases the quota counters.

Quota rejection returns a generic `429` with:

```http
Retry-After: 120
```

```json
{
  "error": {
    "code": "OTP_DELIVERY_QUOTA_EXCEEDED",
    "message": "Too many code requests. Try again later.",
    "details": { "retryAfterSec": 120 }
  }
}
```

## In-memory request throttles

Nest throttles are cheap process-local safety valves:

| Bucket              | Window   | Default | Applied to                                      |
| ------------------- | -------- | ------- | ----------------------------------------------- |
| `default`           | 1 minute | 1000    | Every non-exempt endpoint, independently        |
| `otp-request-burst` | 1 minute | 10      | Email OTP request and generic OTP resend routes |
| `login-ip`          | 1 minute | 10      | Google and Apple token exchanges                |

The global guard evaluates only `default`. Composite route decorators attach
guards that evaluate only their selected strict bucket. A named bucket can
therefore never run accidentally on refresh, `/me`, logout, OTP verification,
or enabled-method loading.

`/healthz` and `/.well-known/jwks.json` skip the global throttle. Health probes
must not mark a healthy instance unavailable, and JWKS is a static cached
response that may be refreshed by many clients during key rotation.

Counters use direct `req.ip`; proxy trust is disabled. `X-Forwarded-For` is not
accepted as client identity.

## Deployment limitations

Nest throttler storage is in memory, so every API process has independent burst
counters. That is intentional: these limits are approximate DoS backstops.
Persistent OTP delivery quotas remain accurate across API instances and
restarts because PostgreSQL owns them.

Neither layer replaces upstream DDoS protection, bot detection, or a CDN/WAF.
Deployments behind a reverse proxy must configure trusted proxy handling before
depending on IP-based controls.

Verification guessing is controlled separately by
`OtpChallenge.attemptsCount` and `OTP_MAX_ATTEMPTS`.
