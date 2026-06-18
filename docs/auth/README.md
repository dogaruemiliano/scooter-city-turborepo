# Authentication

NestJS owns authentication. The web app and future native clients consume the
same `/v1/auth/*` API contracts from `@repo/api-shared`.

## Supported methods

| Method    | API | Web | Notes                                       |
| --------- | --- | --- | ------------------------------------------- |
| Email OTP | Yes | Yes | Passwordless sign-up and sign-in.           |
| Google    | Yes | Yes | Exchanges a Google ID token for a session.  |
| Apple     | Yes | No  | API is complete; web UI is not implemented. |

`GET /v1/auth/enabled-methods` returns the methods enabled on the API:

```json
{
  "methods": ["emailOtp", "google"]
}
```

A client renders a method only when it both appears in this response and has a
client implementation.

## Session model

Successful authentication creates:

1. A `Session` row for the device.
2. A short-lived RS256 access token.
3. A long-lived refresh token whose HMAC is stored in PostgreSQL.

The API returns both tokens in the response body for native clients and sets
HttpOnly cookies for the web app.

The web app:

- Sends browser requests directly to NestJS.
- Uses `NEXT_PUBLIC_API_URL` as the single API origin.
- Verifies access tokens in Server Components through the API JWKS.
- Refreshes expired access tokens through `POST /v1/auth/refresh`.

## Main endpoints

| Endpoint                             | Purpose                                  |
| ------------------------------------ | ---------------------------------------- |
| `GET /v1/auth/enabled-methods`       | List enabled authentication methods.     |
| `POST /v1/auth/email-otp/request`    | Request an email authentication code.    |
| `POST /v1/auth/email-otp/verify`     | Verify an email authentication code.     |
| `POST /v1/auth/otp/resend`           | Resend an active OTP challenge.          |
| `POST /v1/auth/google`               | Exchange a Google ID token.              |
| `POST /v1/auth/apple`                | Exchange an Apple ID token.              |
| `POST /v1/auth/oauth-email/verify`   | Verify an untrusted OAuth email claim.   |
| `POST /v1/auth/refresh`              | Rotate the refresh token.                |
| `GET /v1/auth/me`                    | Return the current database-backed user. |
| `POST /v1/auth/logout`               | Revoke the current session.              |
| `POST /v1/auth/logout-all`           | Revoke all user sessions.                |
| `GET /v1/auth/sessions`              | List active sessions.                    |
| `DELETE /v1/auth/sessions/:id`       | Revoke one session.                      |
| `DELETE /v1/auth/accounts/:provider` | Unlink an OAuth provider.                |
| `DELETE /v1/auth/me`                 | Delete the current account.              |

The generated `openapi.json` is the complete HTTP reference.

## Security controls

- RS256 access and refresh JWTs with JWKS publication and key rotation.
- Refresh-token rotation with a multi-instance-safe grace window.
- Session burn when an old refresh token is replayed after the grace window.
- HttpOnly, `SameSite=Lax` cookies.
- `X-Requested-With: fetch` for cookie-authenticated mutations.
- Generic OTP errors to reduce account enumeration.
- OTP attempt lockout, resend cooldowns, delivery quotas, and route throttles.
- Atomic user creation, provider linking, challenge claiming, and session
  issuance.
- Append-only audit events for authentication and account actions.

## Configuration

The API validates configuration at startup. Start with
[`apps/api/.env.example`](../../apps/api/.env.example).

Important groups:

- `AUTH_*_ENABLED`: enable email OTP, Google, or Apple.
- `JWT_*` and `REFRESH_TOKEN_HMAC_SECRET`: token signing and storage.
- `OTP_*`: code lifetime, attempts, quotas, and HMAC secret.
- `SMTP_*`: email delivery.
- `GOOGLE_CLIENT_ID_*`: accepted Google audiences.
- `APPLE_SERVICE_ID` / `APPLE_BUNDLE_ID`: accepted Apple audiences.
- `COOKIE_DOMAIN` and `CORS_ORIGINS`: browser deployment.

The web app requires `NEXT_PUBLIC_API_URL`. Google web sign-in additionally
requires `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

## Detailed guides

- [OTP challenges](./otp.md)
- [OAuth account linking](./oauth-linking-rules.md)
- [Sign in with Apple](./apple-signin.md)
- [Refresh-token rotation](./refresh-rotation.md)
- [Cookies and CSRF](./cookies.md)
- [Sessions and audit events](./sessions-and-audit.md)
- [Rate limiting and OTP quotas](./rate-limiting.md)
- [SMS transport](./sms-provider.md)

## Known scope limits

- Apple has no web UI yet.
- Mobile authentication UI and token storage are not implemented.
- Trusted-proxy handling is intentionally disabled.
- 2FA/TOTP, email change, and phone verification are not included.
- In-memory request throttles are process-local; hosting-level DDoS protection
  is still required.
