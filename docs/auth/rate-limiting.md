# Rate limiting

Throttler buckets, what they protect, and the in-memory storage caveat.

## Buckets

Defined in [`apps/api/src/auth/throttler.config.ts`](../../apps/api/src/auth/throttler.config.ts). Each is a named bucket with a TTL window and a per-tracker limit. The active tracker by default is the client IP (`req.ip`).

| Bucket             | Window   | Default limit | Env override                       | Protects                                                                       |
| ------------------ | -------- | ------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| `otp-ip`           | 1 hour   | 20            | `THROTTLE_OTP_PER_IP_PER_HOUR`     | One IP can't carpet-bomb OTP requests across many email/phone targets.         |
| `otp-target`       | 1 hour   | 5             | `THROTTLE_OTP_PER_TARGET_PER_HOUR` | One email or phone can't be hit more than 5× per hour, even from rotating IPs. |
| `otp-target-daily` | 24 hours | 20            | `THROTTLE_OTP_PER_TARGET_PER_DAY`  | Long-window cap on per-target abuse.                                           |
| `login-ip`         | 1 minute | 10            | `THROTTLE_LOGIN_PER_IP_PER_MIN`    | Brute-force credentials attempts from one IP.                                  |

Tune via env without code changes. The locked defaults are conservative; bump for high-traffic production with care.

## How endpoints declare buckets

PR 5 wires the **global `ThrottlerGuard`** but doesn't apply per-endpoint `@Throttle({...})` decorators yet — those land alongside the auth-method controllers in PR 8+. Once they do, each endpoint mixes the buckets that apply to it:

```ts
// Email-OTP request endpoint (PR 8 preview)
@Throttle({
  "otp-ip": {},
  "otp-target": {},
  "otp-target-daily": {},
})
@Post("email-otp/request")
request(@Body() dto: RequestEmailOtpDto) { ... }

// Credentials login endpoint (PR 9 preview)
@Throttle({ "login-ip": {} })
@Post("credentials/login")
login(@Body() dto: LoginDto) { ... }
```

Endpoints that don't list a bucket in `@Throttle` still go through the global guard but with default limits — which we intentionally leave high. The named buckets are how we keep aggressive limits on the abusive endpoints.

## Per-target tracking (the custom tracker)

The default tracker is IP, but `otp-target` and `otp-target-daily` need to bucket per email/phone — a single attacker rotating IPs against one target shouldn't bypass them.

The custom tracker (lands with the email-OTP endpoint in PR 8) reads `req.body.email` or `req.body.phone` and returns a composite key like `${ip}::${target}`. That gives per-IP-per-target buckets and ensures the limit is enforced no matter how many IPs the attacker has.

## In-memory storage caveat

`@nestjs/throttler` uses an in-memory store by default. **Each API process tracks its own counters.** A multi-pod deployment effectively gets `N × configured` limits, where `N` is the pod count.

For PR 5 this is fine — single-pod dev + CI use cases. Production deployments with multi-pod sizing should swap to Redis storage:

```ts
ThrottlerModule.forRootAsync({
  inject: [ENV],
  useFactory: (env) => ({
    throttlers: buildThrottlerOptions(env),
    storage: new ThrottlerStorageRedisService(redisClient), // post-v1 work
  }),
});
```

Documented as a follow-up in the locked plan.

## Response headers

The guard appends rate-limit headers to every response that passes through it (you can see them in the E2E test logs):

```
x-ratelimit-limit-otp-ip: 20
x-ratelimit-remaining-otp-ip: 19
x-ratelimit-reset-otp-ip: 3600
```

Clients can use these to back off proactively. The OpenAPI doc currently doesn't declare them; adding `@ApiHeader` annotations is a small cleanup task.

## What rate limiting does NOT replace

- **Bot detection** — Cloudflare / hCaptcha go in front of the API. Throttler is a backstop, not the only line of defense.
- **OAuth flow rate limits** — provider tokens are verified server-side; if we're handed 10000 forged tokens per second from one IP, the throttler's `login-ip` bucket catches them, but the per-token verification cost still hits us. Provider rate limits + bot detection are the upstream defenses.
- **Account lockout** — separately tracked via `OtpToken.attemptsCount` and (future) credentials-login attempt counters. Throttler is about request volume; lockout is about consecutive failures on one account.
