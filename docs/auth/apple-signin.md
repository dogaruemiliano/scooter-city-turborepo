# Sign in with Apple

`POST /v1/auth/apple` exchanges an Apple identity token for a local session.
General provider-linking rules are documented in
[oauth-linking-rules.md](./oauth-linking-rules.md).

## Request

```json
{
  "idToken": "<Apple-issued JWT>",
  "fullName": {
    "givenName": "Ada",
    "familyName": "Lovelace"
  }
}
```

`fullName` is optional. Apple normally supplies it only during the first
authorization, outside the ID token. The API uses it only when creating a new
user.

## Responses

- `200`: first-party token pair and HttpOnly cookies.
- `202`: email-verification challenge when Apple supplied an email that cannot
  be trusted as verified.
- `400`: invalid request body.
- `401`: invalid Apple token, missing email for an unlinked identity, or
  invalid verification challenge.

## Token verification

`RealAppleVerifier` verifies Apple JWTs with Apple's published JWKS and checks:

- `iss` is `https://appleid.apple.com`
- `aud` matches `APPLE_SERVICE_ID` or `APPLE_BUNDLE_ID`
- token expiry and issue time
- the presence of a stable `sub`

`jose` manages JWKS caching and key refresh.

At least one audience must be configured when Apple authentication is enabled:

```env
AUTH_APPLE_ENABLED=true
APPLE_SERVICE_ID=com.example.app.web
# or
APPLE_BUNDLE_ID=com.example.app
```

Configure both when web and native Apple clients use the same API.

## Email behavior

Apple may omit email after the first authorization. Once an
`AuthAccount(apple, sub)` exists, the stable `sub` is enough to resolve the
user.

For a new provider subject:

- Verified email: link or create the matching local user.
- Unverified email: require the shared email OTP flow.
- Missing email: return generic `401`.

The API preserves the email originally stored on the Apple `AuthAccount`.
Repeat logins do not overwrite it.

## Private relay

Addresses ending in `@privaterelay.appleid.com` are valid deliverable email
addresses. The API treats them like any other address.

Apple can represent `email_verified` and `is_private_email` as booleans or as
the strings `"true"` and `"false"`. The verifier normalizes both forms.

## Scope

The Apple API flow is implemented. The web app does not yet render an Apple
sign-in button.

Server-to-server token revocation is not implemented. `APPLE_TEAM_ID` and
`APPLE_KEY_ID` are reserved for projects that add that feature.
