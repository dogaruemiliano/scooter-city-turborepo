-- Remove document-level issuance data. Licence category acquisition dates stay
-- in licenseCategories and financial document dates are unrelated.
BEGIN;

ALTER TABLE "PersonDocument" DROP COLUMN "issuedBy", DROP COLUMN "issuedOn";

-- Dropping issuedBy also removes its expression index. Keep document search
-- indexed with the same expression used by PersonsService.
CREATE INDEX "PersonDocument_search_trgm_idx" ON "PersonDocument" USING gin (
  lower(
    coalesce("type", '') || ' ' || coalesce("series", '') || ' ' ||
    coalesce("number", '') || ' ' || coalesce("cnp", '') || ' ' ||
    coalesce("issuingCountryCode", '') || ' ' || coalesce("status", '') || ' ' ||
    coalesce("notes", '')
  ) gin_trgm_ops
) WHERE "deletedAt" IS NULL;

UPDATE "PersonDocument"
SET "series" = NULL, "number" = NULL, "expiresOn" = NULL
WHERE "type" = 'proofOfAddress';

-- Audit changes also stored the retired values. Preserve the events and all
-- other changes, including driving licence category acquisition dates.
UPDATE "AuditEvent" AS event
SET "meta" = jsonb_set(event."meta", '{changes}', COALESCE((
  SELECT jsonb_agg(change.value ORDER BY change.ordinality)
  FROM jsonb_array_elements(event."meta"->'changes') WITH ORDINALITY AS change(value, ordinality)
  WHERE change.value->>'field' NOT IN ('document.issuedBy', 'document.issuedOn', 'document.issuedAt')
), '[]'::jsonb))
WHERE event."type" LIKE 'PERSON_%'
  AND jsonb_typeof(event."meta"->'changes') = 'array';

-- Queue retired CEI reverse objects for the existing retryable storage cleanup.
-- The dedicated purpose prevents these uploads from being attached again.
INSERT INTO "DraftUpload" (
  "id", "userId", "provider", "bucket", "storageKey", "contentType", "byteSize",
  "checksumSha256", "purpose", "expiresAt", "createdAt"
)
SELECT 'retired-cei-back-' || asset."id", asset."uploadedByUserId", asset."provider",
  asset."bucket", asset."storageKey", asset."contentType", asset."byteSize",
  asset."checksumSha256", 'retired-cei-back', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "MediaAsset" AS asset
JOIN "PersonDocumentPhoto" AS photo ON photo."assetId" = asset."id"
JOIN "PersonDocument" AS document ON document."id" = photo."personDocumentId"
WHERE document."type" = 'nationalId' AND document."nationalIdFormat" = 'electronic'
  AND photo."slot" IN ('back', 'other')
ON CONFLICT ("storageKey") DO UPDATE SET
  "purpose" = 'retired-cei-back', "claimedAt" = NULL,
  "cleanupStartedAt" = NULL, "expiresAt" = CURRENT_TIMESTAMP;

UPDATE "MediaAsset" AS asset SET "deletedAt" = COALESCE(asset."deletedAt", CURRENT_TIMESTAMP)
FROM "PersonDocumentPhoto" AS photo, "PersonDocument" AS document
WHERE photo."assetId" = asset."id" AND document."id" = photo."personDocumentId"
  AND document."type" = 'nationalId' AND document."nationalIdFormat" = 'electronic'
  AND photo."slot" IN ('back', 'other');


DELETE FROM "PersonDocumentPhoto" AS photo USING "PersonDocument" AS document
WHERE document."id" = photo."personDocumentId"
  AND document."type" = 'nationalId' AND document."nationalIdFormat" = 'electronic'
  AND photo."slot" IN ('back', 'other');

COMMIT;
