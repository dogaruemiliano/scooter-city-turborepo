# Finance selector query-plan notes

This note records the initial index decision for
`GET /v1/finance/wallet-options`. It should be revisited with production-like
data distribution and concurrency before selector traffic grows materially.

## Baseline

Measured on PostgreSQL 16 on July 29, 2026, using session-scoped temporary
tables copied from the current `User` and `Wallet` definitions:

- 50,000 users;
- 50,000 user wallets;
- 3,000 company wallets across cash, bank, and payment-processor types;
- the schema's existing indexes, including `Wallet(type, isActive)`;
- analyzed table statistics;
- a page limit of 26 (the default 25 results plus the next-page probe).

The fixture and its statistics were rolled back after the measurements. The
queries mirrored the selector's filters, owner join, stable relation/name/ID
ordering, and case-insensitive substring matching.

`EXPLAIN (ANALYZE, BUFFERS)` reported:

| Selector case                 | Execution time | Relevant plan behavior                                 |
| ----------------------------- | -------------: | ------------------------------------------------------ |
| Owner/name substring `%ada%`  |        70.2 ms | Sequential scans of users and wallets; 50 matches      |
| Active company wallets        |         3.8 ms | Existing wallet type/activity index                    |
| Active `COMPANY_CASH` wallets |         7.2 ms | Bitmap scan on the existing wallet type/activity index |

## Decision

No index or extension migration is added with the endpoint.

The company presets already use the existing index effectively. The synthetic
substring baseline is acceptable for the initial admin-only selector, but its
sequential scans are the path to watch. A normal B-tree index will not optimize
arbitrary `%term%` matching.

Re-run the plans against representative production cardinality and inspect
request latency before changing the schema. If substring search becomes a
measured bottleneck, evaluate `pg_trgm` indexes for wallet name and the selected
owner fields in a separate, operationally reviewed migration.
