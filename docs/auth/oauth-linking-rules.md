# OAuth account linking

Google and Apple use the same local account-resolution policy after their ID
tokens have been verified.

## Decision table

| Provider state                                  | API action                                       |
| ----------------------------------------------- | ------------------------------------------------ |
| Matching `AuthAccount(provider, sub)` exists    | Sign in the linked user.                         |
| Verified email matches an existing user         | Link the provider and sign in that user.         |
| Verified email has no existing user             | Create the user, link the provider, and sign in. |
| Email is missing and no provider link exists    | Return a generic `401`.                          |
| Email exists but the provider did not verify it | Send an OTP challenge before linking.            |

`OAuthAccountResolver` owns the shared database decision. Provider services
handle provider-specific verification, audit events, and session issuance.

First-time resolution uses a short Serializable transaction with retry handling
for write conflicts. Concurrent requests therefore converge on one user and one
provider link.

## Why unverified email requires OTP

An unverified provider claim is not proof that the provider account owns the
address. Auto-linking it to an existing local user could create an
account-takeover path.

The API instead returns the same challenge shape whether the local email exists
or not:

```json
{
  "status": "verification_required",
  "challengeId": "uuid",
  "expiresInSec": 600,
  "resendAfterSec": 30
}
```

`POST /v1/auth/oauth-email/verify` accepts `{ challengeId, code }`. Successful
verification atomically:

1. Claims the challenge.
2. Finds or creates the user.
3. Links the provider subject.
4. Marks the email verified when necessary.
5. Creates the session.

Provider tokens are not stored in the challenge.

## Provider differences

### Google

- Accepts audiences from `GOOGLE_CLIENT_ID_WEB`, `_IOS`, and `_ANDROID`.
- Uses Google `sub` as the stable provider identifier.
- Synchronizes `AuthAccount.email` on repeat login.
- Never changes `User.email` during repeat login.

### Apple

- Accepts `APPLE_SERVICE_ID` and/or `APPLE_BUNDLE_ID`.
- Uses the app-scoped Apple `sub` as the stable provider identifier.
- Preserves the original `AuthAccount.email` on repeat login.
- Can omit email after the first authorization.
- Supports Apple private-relay addresses without special handling.

See [apple-signin.md](./apple-signin.md) for Apple-specific details.

## Unlinking

`DELETE /v1/auth/accounts/:provider` removes a provider link.

The API returns `409` if removing it would leave the user with no remaining
enabled sign-in method. A verified email counts only when email OTP is enabled;
linked OAuth providers count only while their method is enabled.

Unlinking does not revoke active sessions. Use `POST /v1/auth/logout-all` when
all devices should also be signed out.

Signing in again with the same provider can recreate the link through the same
verified-email rules.

## Related controls

- Google and Apple token exchanges use the `login-ip` burst throttle.
- Missing-email and invalid-provider-token failures return generic `401`
  responses.
- Provider verification failures and successful link operations are recorded
  in the audit log.
