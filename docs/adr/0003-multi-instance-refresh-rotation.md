# ADR 0003 — Multi-instance-safe refresh-token rotation

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** template author

## Context

The web app has cookies, the cookies have refresh tokens, and the refresh tokens need to rotate. The tricky bit is concurrency:

1. **Multi-tab**: a user with 5 tabs open whose access token just expired will fire 5 `/v1/auth/refresh` calls before any tab's cookie has had a chance to update.
2. **Multi-pod**: an API behind a load balancer fans these 5 calls across 2-3 different processes.

Naive implementations either:

- **Burn the session on the second call.** The first refresh succeeds, second sees a revoked token, treats it as reuse, revokes everything. User gets logged out for opening too many tabs. Worst behavior.
- **Cache "I just rotated this" in process memory** with a 10-second TTL. m-turborepo's pattern. Survives same-process concurrency but not multi-pod — pod B doesn't know pod A just rotated this token.

We need something that works correctly under both concurrency patterns.

## Decision

Two columns on `RefreshToken`:

- `previousJti` (nullable, unique) — chain pointer to the row this one replaced.
- `revokedAt` (nullable) — when the row was retired.

The rotation algorithm uses Postgres row-level locks (`SELECT … FOR UPDATE`) to serialize same-token rotations across processes, and **walks the `previousJti` chain forward** when a revoked token comes in within a grace window. Each concurrent rotation chains its own new step.

Full algorithm in [`docs/auth/refresh-rotation.md`](../auth/refresh-rotation.md). Implementation in [`apps/api/src/auth/modules/core-auth/core-auth.service.ts`](../../apps/api/src/auth/modules/core-auth/core-auth.service.ts).

## Reasoning

1. **Postgres handles the cross-process concurrency for free.** A `FOR UPDATE` row lock serializes rotations of the same `jti` across every pod that talks to the database. We don't need Redis, we don't need a coordinator, we don't need a leader-elect dance.

2. **The chain encodes "we already rotated this, here's where to look next."** When pod B sees a revoked token, it doesn't need pod A's in-memory state — it has the chain. The successor row tells it what to do.

3. **The chain walk is bounded.** Walks proceed forward exactly as far as the depth of concurrent rotations under the same root. Realistic upper bound is "tabs in one browser" — single digits.

4. **No new infrastructure.** The whole mechanism is two columns and one row-level lock. No Redis, no message queue, no leader election. Add Redis later if throttler storage demands it; rotation doesn't.

## Trade-offs accepted

- **The chain shape is not "literal idempotency".** Each concurrent caller gets a _different_ new pair, not the same one. m-turborepo's in-memory cache returned the _literal same_ pair to the second caller within the grace window; our chain returns a fresh pair from each call. Both are valid; in our implementation each tab gets its own new chain step. This is fine for correctness — every token issued in the chain works — and is the only realistic option when refresh tokens are HMAC-hashed (we can't replay a token we never stored plaintext for).

- **Chain depth grows under heavy multi-tab burst.** A user with 20 tabs refreshing simultaneously can create a 20-link chain. Browser requests in one JavaScript runtime share a module-level singleflight promise, but separate tabs remain independent. The database algorithm is therefore still the correctness boundary.

- **Reuse detection has a 10-second grace window.** A token replayed within the window is treated as concurrent-multi-tab, not reuse. Inside the window an attacker who already has the token could get a fresh pair; outside, they trip the burn. The trade-off is "occasional false-negative on reuse detection within the first 10 seconds" vs "false-positive every multi-tab refresh." We chose the former.

## What we explicitly rejected

- **m-turborepo's in-memory `Map<jti, …>` cache.** Per-process. Breaks the moment we add a second pod. The literal motivation for this ADR.

- **`SERIALIZABLE` isolation level.** Postgres detects conflicts and aborts one tx with a serialization-failure error; client must retry. Adds retry-with-backoff complexity to every rotation. Over-locks — any transaction with overlapping reads gets aborted, not just same-`jti` rotations. The chain + `FOR UPDATE` gives the same correctness guarantee with a far smaller blast radius.

- **`pg_advisory_xact_lock(hashtext(jti))`.** Works but obscure. Postgres advisory locks are global by hash; the lock is held for the transaction but doesn't actually lock the row, just keeps other holders of the same key out. `FOR UPDATE` is the more idiomatic choice when you literally want to lock the row.

- **Optimistic locking with a version column.** Adds a column and a retry loop; FOR UPDATE is simpler.

## Consequences

- The schema is committed to the `previousJti` + `revokedAt` shape. Changing it later requires a careful migration.
- The algorithm depends on Prisma's `$transaction(async (tx) => …)` running on a single Postgres connection from the pool for the duration of the transaction. Confirmed in Prisma 7's driver-adapter docs.
- `$queryRaw FOR UPDATE` is unavoidable because Prisma has no typed row-lock API. Documented at the call site.
- The burn writes that follow reuse detection run in their **own transaction** after the rotation transaction commits — otherwise throwing the `UnauthorizedException` would roll the burn back. This is why `rotateTokens` returns a discriminated `{ kind: "ok" | "burn" | "invalid" }` and `burnSessionExternal` is a separate Prisma transaction.

## Test coverage

[`apps/api/test/core-auth.e2e-spec.ts`](../../apps/api/test/core-auth.e2e-spec.ts) covers all the algorithm branches end-to-end:

- single rotate / grace replay / replay-after-grace burns / parallel-N / unknown jti / tampered JWT.

[`apps/api/test/core-auth-timing.e2e-spec.ts`](../../apps/api/test/core-auth-timing.e2e-spec.ts) covers the timing-attack analysis documented inline.

## Possible future optimization

Literal idempotent grace replay would require temporarily storing recoverable token
material. Add that complexity only if production traces show that bounded chain
walking is a real bottleneck.
