# Refresh-token rotation

`CoreAuthService.rotateTokens()` consumes one refresh token and returns a new
access/refresh pair.

Read this document before changing the rotation algorithm.

## Stored data

Each refresh-token row contains:

- `jti`: unique token identifier
- `tokenHash`: HMAC of the complete refresh token
- `sessionId`: owning session
- `previousJti`: token replaced by this row
- `revokedAt`: when this token stopped being active

Plaintext refresh tokens are never stored.

## Normal rotation

1. Verify the RS256 JWT and require `tokenType=refresh`.
2. Lock its database row with `SELECT ... FOR UPDATE`.
3. Confirm the row belongs to the JWT user and session.
4. Compare the stored HMAC in constant time.
5. Mark the old row revoked.
6. Insert the replacement row with `previousJti` pointing to the old `jti`.
7. Update `Session.lastUsedAt`.
8. Return the new token pair.

The row lock serializes rotations of the same token while allowing unrelated
sessions to rotate concurrently.

## Grace window

Browser tabs can submit the same old refresh cookie at nearly the same time.
Immediately treating the second request as theft would log out legitimate
users.

For `ROTATION_GRACE_SECONDS`—10 seconds by default—the service walks the
`previousJti` chain to the newest live descendant and rotates from there.
Concurrent tabs therefore produce a short chain instead of burning the
session.

The web refresh adapter also deduplicates refresh calls within one browser
runtime, but the database algorithm remains the source of correctness across
tabs and API instances.

## Replay after grace

If a revoked token has no live descendant inside the grace window, the service
treats it as reuse:

1. Finish the row inspection transaction.
2. Revoke the owning session and all active refresh-token rows in a separate
   transaction.
3. Return `401`.

The burn uses a separate transaction because throwing inside the inspection
transaction would roll back the revocation.

## Why this design

- Database row locks work across multiple API processes.
- The linked chain supports legitimate concurrent refreshes.
- Old-token replay invalidates the complete session.
- No plaintext successor token needs to be stored.

An in-memory refresh cache is not acceptable because each API process would
have a different view.

## Tests

The focused suites cover:

- Standard rotation
- Concurrent grace-window rotation
- Replay after grace and session burn
- Unknown token identifiers
- Invalid signatures
- Constant-time hash comparison sanity

See:

- [`core-auth.e2e-spec.ts`](../../apps/api/test/core-auth.e2e-spec.ts)
- [`core-auth-timing.e2e-spec.ts`](../../apps/api/test/core-auth-timing.e2e-spec.ts)
