WITH active_identity_documents AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "personId"
      ORDER BY
        CASE "type"
          WHEN 'nationalId' THEN 1
          WHEN 'passport' THEN 2
          WHEN 'residencePermit' THEN 3
          ELSE 4
        END,
        "createdAt",
        "id"
    ) AS "rank"
  FROM "PersonDocument"
  WHERE "deletedAt" IS NULL
    AND "type" IN ('passport', 'nationalId', 'residencePermit', 'other')
)
UPDATE "PersonDocument"
SET "deletedAt" = NOW()
WHERE "id" IN (
  SELECT "id"
  FROM active_identity_documents
  WHERE "rank" > 1
);

CREATE UNIQUE INDEX "person_document_active_identity_unique"
ON "PersonDocument" ("personId")
WHERE "deletedAt" IS NULL
  AND "type" IN ('passport', 'nationalId', 'residencePermit', 'other');
