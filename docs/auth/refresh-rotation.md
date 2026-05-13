# Refresh-token rotation algorithm

How `CoreAuthService.rotateTokens` works, why it works that way, and what the alternatives would buy or cost.

This is the single most security-sensitive piece of the auth subsystem. Read this before changing anything in [`apps/api/src/auth/modules/core-auth/core-auth.service.ts`](../../apps/api/src/auth/modules/core-auth/core-auth.service.ts).

## TL;DR

Every refresh consumes one token and mints a new pair. The old token is revoked. Replaying a revoked token after a 10-second **grace window** triggers a full **session burn** — every refresh-token row sharing that `sessionId` gets revoked, and the user has to re-authenticate. Within the grace window, concurrent rotations from the same browser (multiple tabs) chain forward instead of burning — each tab gets its own valid new pair.

## The data model

Two columns on `RefreshToken` carry the algorithm:

- `previousJti` — points back to the row this one replaced. Forms a singly-linked chain per `sessionId`.
- `revokedAt` — `null` while the token is live; set to a timestamp the moment the token is rotated, logged out, or burned.

See [`docs/auth/sessions-and-audit.md`](./sessions-and-audit.md) for the full table layout and cascade behavior.

## The happy path

```
T0  Tab A presents token X (jti=A)
    ↓
    Lock RefreshToken row for jti=A          (Postgres FOR UPDATE)
    ↓
    Row found · revokedAt is null
    Hash matches (HMAC SHA-256, peppered)    ✓
    ↓
    Mint new pair (Y, jti=B, previousJti=A)
    Set row(A).revokedAt = now
    Insert row(B)
    Update Session.lastUsedAt = now
    Commit
    ↓
    Return new pair to Tab A
```

## The grace window (multi-tab concurrency)

Browser tabs share cookies. When the access token expires, every open tab might call `/v1/auth/refresh` with the same old refresh token before any of them sees the rotated cookie. Without a grace window, the second tab onwards would present an already-revoked token, trigger reuse detection, and burn the user's session out from under them.

The window is `ROTATION_GRACE_SECONDS` (default **10 seconds**). Inside the window, the service walks the chain forward — past any number of already-rotated successors — and chains a new step from the youngest live link:

```
T0  Tab A presents X (jti=A) → rotates to Y (jti=B). row(A).revokedAt = now.
T1  Tab B presents X (jti=A)
    ↓
    Lock row for jti=A
    ↓
    Row found · revokedAt IS set
    ↓
    Walk previousJti chain from A:
       successor of A is B
       B is created < 10s ago and B.revokedAt is null  →  chain target = B
    ↓
    Mint Z (jti=C, previousJti=B)
    Set row(B).revokedAt = now
    Insert row(C)
    Commit
    ↓
    Return Z to Tab B
```

If Tab C, Tab D, … come in within the same window, each walks forward to the latest live link and chains its own step. The chain grows by one node per concurrent rotation; the algorithm is bounded by chain depth, which equals "tabs open in the same browser" — single digits in practice.

## The burn path (reuse detection)

If a revoked token is presented AND no live descendant exists within the grace window, the service treats the token as compromised and burns the entire session:

```
Tab A presents X long after rotation (grace expired)
    ↓
    Lock row for jti=A
    ↓
    Row found · revokedAt IS set
    ↓
    Walk chain: successor B exists but B.revokedAt is set (or createdAt < cutoff)
    No live descendant found
    ↓
    Burn:
       UPDATE RefreshToken SET revokedAt = now WHERE sessionId = sid AND revokedAt IS NULL
       UPDATE Session      SET revokedAt = now WHERE id        = sid AND revokedAt IS NULL
    Throw UnauthorizedException("Refresh token reuse detected; session revoked")
```

The user must re-authenticate from scratch. **The burn writes run in a separate transaction after the rotation transaction commits.** Throwing inside the rotation transaction would roll back the burn writes — the opposite of what we want.

## Why row-level FOR UPDATE, not SERIALIZABLE

The rotation function locks one row by primary key via `$queryRaw FOR UPDATE`. Concurrent rotations of _different_ refresh tokens proceed in parallel; only same-token rotations serialize. Alternatives considered:

| Approach                                                  | Why we didn't                                                                                                                                                                                                   | When you might switch                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Prisma.$transaction({ isolationLevel: 'Serializable' })` | Over-locks: any overlap with concurrent transactions triggers a retry. Adds retry-with-backoff complexity to every rotation.                                                                                    | If a future feature legitimately needs cross-row consistency that the chain pointer can't express. |
| `pg_advisory_xact_lock(hashtext(jti))`                    | Postgres advisory locks are global by hash, not row-level. The lock is held for the whole transaction but doesn't actually lock the row, just keeps other holders of the same key out. Works, but more obscure. | If `FOR UPDATE` ever shows up as a perf hotspot — advisory locks can be slightly cheaper.          |
| **In-memory `Map<jti, …>` cache** (m-turborepo's pattern) | Per-process. Doesn't survive multi-pod deployments — two pods behind a load balancer each have their own cache. The original concurrency bug we're fixing comes back.                                           | Never — this is the pattern we deliberately moved away from.                                       |

Prisma doesn't expose `FOR UPDATE` as a typed query option in any version, so the raw SQL is unavoidable. Documented in `core-auth.service.ts` at the lock site.

## Why a separate burn transaction

`burnSession` is called from inside `rotateTokens`'s discriminated-result path:

```ts
const result = await prisma.$transaction(async (tx) => {
  // ...
  return { kind: "burn", sessionId };
});

switch (result.kind) {
  case "burn":
    await this.burnSessionExternal(result.sessionId); // separate $transaction
    throw new UnauthorizedException(...);
}
```

If burn ran inside the rotation transaction AND we threw `UnauthorizedException`, Prisma would roll back the burn writes when handling the thrown error. The user would get a 401 BUT their session would still be alive — exactly the opposite of "burned." Splitting into two transactions makes both effects durable.

## Why a chain instead of a single in-DB pointer

Earlier iterations considered storing just one `successorJti` per row instead of a `previousJti` linked list. The chain shape was chosen because:

1. **Forward walks are cheap.** Each step is a `findFirst` on a unique index (`previousJti @unique`).
2. **No back-references.** A row only ever knows about the row it replaced; the parent never knows its child. Easier to reason about.
3. **Trivially append-only.** Chaining a new step is one `create`; no updates to other rows in the chain.

## What about deeply nested grace replays?

The chain walk terminates when:

- A successor is `null` (no further rotation in this session) → fall through to burn.
- A successor's `createdAt` is older than the grace cutoff → fall through to burn.
- A successor's `revokedAt` is `null` → use it as the chain target.

Worst case is "user has N tabs open, access token expires, all N tabs refresh simultaneously." Each call walks the chain up to N-1 steps. For N=10 tabs the algorithm does up to 10 sequential `findFirst` calls per call — well under the 10s grace budget. For N=1000+ you'd see real latency, but that's also not a realistic browser scenario.

The web-side mitigation is the `BroadcastChannel('auth')` lock landing in PR 14: only one tab refreshes; others wait for the cookie to update. With it, the chain rarely exceeds depth 1.

## Test coverage

[`apps/api/test/core-auth.e2e-spec.ts`](../../apps/api/test/core-auth.e2e-spec.ts) covers:

- Single rotation: old token rejected after grace expires, new token works.
- Grace replay: old token presented within window yields a fresh chain step.
- Replay-after-grace burns the session: every refresh row revoked, session marked revoked.
- Parallel-3 rotations all succeed (FOR UPDATE serializes them; chain walks find the live link).
- Unknown `jti` (signature valid but row never persisted) → 401, no session touched.
- Tampered JWT signature → 401.

[`apps/api/test/core-auth-timing.e2e-spec.ts`](../../apps/api/test/core-auth-timing.e2e-spec.ts) covers timing-attack sanity:

- `performDummyHashCompare` actually waits (~bcrypt cost).
- `rotateTokens` with valid-sig-unknown-jti hits the DB (not an instant fail).
- Burn-path within 10× of success-path on average — `safeEqualHex` is constant-time.

## What's not implemented yet

- **Audit emission on rotation events.** `CoreAuthService` is intentionally side-effect-free; controllers will record `LOGIN_SUCCESS` / `SESSION_BURNED` etc. (PR 8+).
- **`pendingTokenHash` column.** Schema has it; the algorithm doesn't read or write it. Reserved for a possible future option-B-style "literal idempotent replay" — only viable if we accept storing the next-pair plaintext for the grace window, which the current design avoids.
- **Single-tab refresh coordination on the web side.** The chain handles multi-tab correctness server-side, but each tab still issues its own network call. `BroadcastChannel` mitigation is PR 14.
