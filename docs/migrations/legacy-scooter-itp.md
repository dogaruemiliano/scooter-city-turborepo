# Recovering ITP validity for older scooters

Older scooters can have a CIV metadata record without an issue date. The original
metadata migration created those records with `issuedAt = NULL`; it did not infer
dates from vehicle manufacture or registration. The initial ITP calculation needs
the explicit CIV issue date.

Re-extraction previously failed when the merged `civRawFields` exceeded 100 keys.
An observed request contained 113 keys: old labels and newly accepted labels were
both retained. The aggregate schema now permits 2,000 entries while retaining the
existing key and value length bounds. Individual extraction readings retain their
own bounds. No schema migration is needed for this change.

The editor's explicit ITP validity save now records a manual confirmation. An
unreadable extracted result stays unknown, and a date-only edit cannot automatically
confirm a known failed inspection. Direct inspection-history requests retain their
explicit result semantics.

Saving recovered CIV metadata also reconciles a lone unknown manual date when it
exactly equals CIV issuance plus two years and has no inspection date or document
links. That confirmation is appended to history. This path does not infer a new
physical inspection. Initial CIV validity does not require renewal client documents;
actual inspections and validity outside the initial period still require them.

## Recover one scooter through the application

Deploy the API and web app with the updated shared package first. Enter the printed
CIV issue date in the edit screen, or accept it from re-extraction, and save. This
does not require running extraction again when the printed date is already known.

For `002 KYM`, the reported CIV date is `2026-08-21` and the initial expiry is
`2028-08-21`. A lone unknown manual entry with that expiry is reconciled during the
save. If other inspection history exists, review it explicitly rather than treating
the CIV date as an override.

## Audit and repair the older fleet

Run from `apps/api` with the intended environment's `DATABASE_URL` supplied through
the normal environment configuration. The script explicitly loads `dotenv/config`
and uses the project's Prisma 7 generated client, PostgreSQL adapter and pool settings.

```bash
pnpm exec tsx scripts/repair-legacy-scooter-itp.ts --dry-run
```

This is read-only. It prints one JSON report per active scooter, including its brand
code, proposed CIV date, candidate manual inspection, and review flags. It makes no
OCR calls and does not download or alter files.

Review the report before choosing to apply:

```bash
pnpm exec tsx scripts/repair-legacy-scooter-itp.ts --apply
```

The apply mode re-reads and plans each scooter under the same row lock used by editor
saves. It only:

- Fills a missing CIV issue date from a unique, valid, non-future `civIssuedAt` in
  stored CIV extraction data. An existing canonical date is never overwritten.
- Changes a lone unknown, date-only manual entry to confirmed when it exactly
  matches that CIV's initial expiry. No actual inspections or failures are changed.
- Advances the scooter revision so a stale editor cannot overwrite the repair.

The repair is idempotent and atomic per scooter. It does not delete documents,
rewrite registration or insurance, or guess dates from raw labels. Conflicting or
missing stored evidence is reported for manual review. For those scooters, enter
the verified CIV issue date or use the corrected re-extraction flow. Inspect
`needsItpReview` separately when a manual entry does not qualify for automatic repair.

This script has not been run against production as part of the code change.
