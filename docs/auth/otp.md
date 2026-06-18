# OTP challenges

The API uses one `OtpChallenge` model for every one-time-code proof. Current
purposes are passwordless email authentication and OAuth email recovery.
SMS authentication was removed; the standalone `SmsModule` remains available
for future notifications and phone-verification flows.

## HTTP surface

| Endpoint                           | Body                    | Success                    |
| ---------------------------------- | ----------------------- | -------------------------- |
| `POST /v1/auth/email-otp/request`  | `{ email }`             | `202 OtpChallengeMetadata` |
| `POST /v1/auth/email-otp/verify`   | `{ challengeId, code }` | `200 TokenPair` + cookies  |
| `POST /v1/auth/otp/resend`         | `{ challengeId }`       | `202 OtpChallengeMetadata` |
| `POST /v1/auth/oauth-email/verify` | `{ challengeId, code }` | `200 TokenPair` + cookies  |

`OtpChallengeMetadata` contains:

```json
{
  "status": "verification_required",
  "challengeId": "uuid",
  "expiresInSec": 600,
  "resendAfterSec": 30
}
```

## Storage

`OtpChallenge` stores the normalized target, purpose, optional user/OAuth
context, OTP HMAC, expiry, attempt count, delivery count, and resend timing.
`activeKey` is unique while a challenge is active and becomes `NULL` when the
challenge is consumed or superseded.

Provider tokens and plaintext OTPs are never persisted.

## Code derivation

- Non-production code: `000000`.
- Production code: deterministic HMAC expansion of the challenge UUID using
  `OTP_HMAC_SECRET`, with rejection sampling for unbiased decimal digits.
- Only `hashOtp(code, OTP_HMAC_SECRET)` is stored.

The deterministic code allows safe resend of the same value without reversible
storage.

## Resends

Resends keep the challenge ID, code, expiry, and verification-attempt count.
They never extend `OTP_TTL`.

| Delivery                 | Next allowed delivery |
| ------------------------ | --------------------- |
| Initial                  | 30 seconds            |
| First resend             | 2 minutes             |
| Second and later resends | 5 minutes             |

An early resend returns current metadata without sending mail. Delivery
reservation is rolled back if SMTP fails; a failed initial delivery deletes the
new challenge.

Actual deliveries are also protected by persistent fixed-window quotas:

- 5 per normalized target per UTC hour.
- 20 per normalized target per UTC day.
- 20 per direct client IP per UTC hour.

Quota identities are HMAC-derived, and email authentication shares target
counters with OAuth email verification. Rejections return a generic `429` with
`Retry-After`.

## Passwordless registration

Requesting a code does not create a user. Successful `AUTH` verification runs
in one Serializable transaction:

1. Claim the challenge.
2. Find or create the user by normalized email.
3. Set `emailVerified` when necessary.
4. Attach the challenge to the user.
5. Create the session and refresh-token row.

New users emit `SIGNUP`, `EMAIL_VERIFIED`, and `LOGIN_SUCCESS`. Existing users
emit only events applicable to their state.

## OAuth recovery

If Google or Apple supplies an email without a trusted verification assertion,
the API creates an `OAUTH_EMAIL_VERIFY` challenge without first querying the
local user by email. Successful verification atomically claims the challenge,
resolves or creates the user, links the provider account, and creates a
session.

## Security

- Verification accepts only the expected challenge purpose.
- Missing, wrong-purpose, used, expired, locked, and wrong-code challenges
  return the same `401 Invalid or expired code`.
- Wrong codes increment `attemptsCount`; `OTP_MAX_ATTEMPTS` permanently locks
  that challenge.
- Resends do not reset attempts.
- Serializable transactions and conditional claims allow one successful
  verification under concurrency.
- Request/resend routes have a short in-memory per-IP burst throttle.
- Persistent delivery quotas survive API restarts and multi-instance deploys.
- A relaxed global per-endpoint throttle protects the rest of the HTTP surface.
- The cleanup job deletes challenges more than seven days past expiry.
