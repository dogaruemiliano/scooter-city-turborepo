BEGIN;

DROP INDEX IF EXISTS "Person_search_trgm_idx";
ALTER TABLE "Person" DROP COLUMN "postalCode";

CREATE INDEX "Person_search_trgm_idx" ON "Person" USING gin (
  lower(
    coalesce("email", '') || ' ' ||
    coalesce("phone", '') || ' ' ||
    coalesce("firstName", '') || ' ' ||
    coalesce("lastName", '') || ' ' ||
    coalesce("addressLine1", '') || ' ' ||
    coalesce("addressLine2", '') || ' ' ||
    coalesce("city", '') || ' ' ||
    coalesce("region", '') || ' ' ||
    coalesce("countryCode", '') || ' ' ||
    coalesce("notes", '')
  ) gin_trgm_ops
);


-- Remove retired values from person audit history while retaining other changes.
UPDATE "AuditEvent" AS event
SET "meta" = jsonb_set(event."meta", '{changes}', COALESCE((
  SELECT jsonb_agg(change.value ORDER BY change.ordinality)
  FROM jsonb_array_elements(event."meta"->'changes') WITH ORDINALITY AS change(value, ordinality)
  WHERE change.value->>'field' <> 'postalCode'
), '[]'::jsonb))
WHERE event."type" LIKE 'PERSON_%'
  AND jsonb_typeof(event."meta"->'changes') = 'array';

COMMIT;
