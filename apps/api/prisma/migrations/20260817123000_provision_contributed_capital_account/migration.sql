-- Existing company books need the account immediately; production does not
-- rerun development seed data after every deployment.
INSERT INTO "LedgerAccount" (
  "id",
  "bookId",
  "code",
  "name",
  "category",
  "role",
  "associateId",
  "isDefault",
  "isActive",
  "isSystem",
  "createdAt",
  "updatedAt"
)
SELECT
  'system-contributed-capital-' || "id",
  "id",
  'COMPANY_CONTRIBUTED_CAPITAL',
  'Contributed Capital',
  'EQUITY',
  'CONTRIBUTED_CAPITAL',
  NULL,
  true,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "FinanceBook"
WHERE "type" = 'COMPANY'
ON CONFLICT ("bookId", "code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "isDefault" = true,
  "isActive" = true,
  "isSystem" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
