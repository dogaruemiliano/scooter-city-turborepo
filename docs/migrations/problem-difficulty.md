# Problem difficulty rollout

The API now uses `difficulty`: `easy`, `medium`, or `hard`. Existing unassessed problems retain `null`; that is a missing assessment, not a fourth level. New reports require an assessment.

Migration `20261024120000_problem_difficulty` adds a nullable text column, a three-value check constraint, and a `(difficulty, status)` index. It backfills low → easy, moderate → medium, high/critical → hard in a transaction. The original `severity` column and its constraint/index remain intact. No rows, relationships, timestamps, revisions, audit JSON, or usage holds are removed or rewritten. This is an agreed initial classification, not an inference about repair effort.

Problem responses expose original values through optional read-only `legacySeverity`. New writes and activity snapshots use `difficulty`; historical activity snapshots keep their original `severity` and remain readable with their original labels. Problems created after this rollout have no legacy severity.

## Deployment

This changes the API contract: request/filter `severity` becomes `difficulty`, and scooter summary `problemSeverityCounts` becomes `problemDifficultyCounts` (easy, medium, hard, unknown). `unknown` counts missing assessments only. Deploy the API and web together, and update any external clients before reopening writes. Stale clients must reload.

1. Take a restorable database backup and rehearse the migration on a restored copy.
2. Pause problem mutations and drain old API instances. Old code does not populate difficulty, so do not allow it to write after backfill.
3. From `apps/api`, with the intended database explicitly configured, run `pnpm prisma migrate deploy`.
4. Deploy the new API and web builds (the build generates the Prisma client). Retire old instances before resuming writes.
5. Check total problem count against the pre-migration count, the preserved severity distribution, and the mapping before allowing difficulty edits:

```sql
SELECT severity, difficulty, COUNT(*)
FROM "ScooterProblem"
GROUP BY severity, difficulty
ORDER BY severity, difficulty;

SELECT COUNT(*) AS unexpected_mapping
FROM "ScooterProblem"
WHERE difficulty IS DISTINCT FROM CASE severity
  WHEN 'low' THEN 'easy'
  WHEN 'moderate' THEN 'medium'
  WHEN 'high' THEN 'hard'
  WHEN 'critical' THEN 'hard'
  ELSE NULL
END;
```

The unexpected count should be zero immediately after backfill. Later manual reassessments may intentionally differ. Also compare usage hold counts and verify an existing report, attachments, assignments, activity, and a new report.

## Recovery

If the migration fails, its transaction rolls back. If the application rollout fails, keep mutations paused while fixing forward. Old code can read the retained severity, but rolling back the application and reopening writes would stop recording difficulty; new reports have no severity and subsequent edits can diverge. Do not drop difficulty or overwrite original severity to reverse the mapping: high and critical cannot be reconstructed from hard. Keep both columns and all audit records.

Verified against Prisma ORM 7.8 and https://www.prisma.io/docs/guides/v7/database/data-migration on 2026-10-24.
