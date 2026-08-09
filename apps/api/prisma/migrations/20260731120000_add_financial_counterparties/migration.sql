-- Counterparties identify who participates in a financial event. Wallets
-- remain money locations and are intentionally unchanged by this migration.
CREATE TYPE "CounterpartyType" AS ENUM ('PERSON', 'COMPANY');

CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "tradingName" TEXT,
  "taxIdentifier" TEXT,
  "taxIdentifierNormalized" TEXT,
  "registrationNumber" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "phoneNormalized" TEXT,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city" TEXT,
  "region" TEXT,
  "postalCode" TEXT,
  "countryCode" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Counterparty" (
  "id" TEXT NOT NULL,
  "type" "CounterpartyType" NOT NULL,
  "personId" TEXT,
  "companyId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Counterparty_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Counterparty_subject_check" CHECK (
    ("type" = 'PERSON' AND "personId" IS NOT NULL AND "companyId" IS NULL)
    OR
    ("type" = 'COMPANY' AND "companyId" IS NOT NULL AND "personId" IS NULL)
  )
);

CREATE UNIQUE INDEX "Company_taxIdentifierNormalized_key"
  ON "Company"("taxIdentifierNormalized");
CREATE INDEX "Company_legalName_idx" ON "Company"("legalName");
CREATE INDEX "Company_phoneNormalized_idx" ON "Company"("phoneNormalized");
CREATE INDEX "Company_phoneNormalized_prefix_idx"
  ON "Company"("phoneNormalized" text_pattern_ops);
CREATE INDEX "Company_taxIdentifierNormalized_prefix_idx"
  ON "Company"("taxIdentifierNormalized" text_pattern_ops);
CREATE INDEX "Company_isActive_deletedAt_idx" ON "Company"("isActive", "deletedAt");
CREATE INDEX "Company_countryCode_deletedAt_idx" ON "Company"("countryCode", "deletedAt");

-- pg_trgm already exists in installations that ran person search, but keeping
-- this idempotent makes the migration safe for a newly provisioned database.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Company_search_trgm_idx" ON "Company" USING gin (
  lower(
    coalesce("legalName", '') || ' ' ||
    coalesce("tradingName", '') || ' ' ||
    coalesce("taxIdentifier", '') || ' ' ||
    coalesce("taxIdentifierNormalized", '') || ' ' ||
    coalesce("registrationNumber", '') || ' ' ||
    coalesce("email", '') || ' ' ||
    coalesce("phone", '') || ' ' ||
    coalesce("phoneNormalized", '')
  ) gin_trgm_ops
) WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Counterparty_personId_key" ON "Counterparty"("personId");
CREATE UNIQUE INDEX "Counterparty_companyId_key" ON "Counterparty"("companyId");
CREATE INDEX "Counterparty_type_isActive_idx" ON "Counterparty"("type", "isActive");

CREATE INDEX "Person_phone_digits_prefix_idx" ON "Person" (
  (regexp_replace(phone, '\\D', '', 'g')) text_pattern_ops
);
CREATE INDEX "PersonDocument_cnp_prefix_idx" ON "PersonDocument"(
  cnp text_pattern_ops
) WHERE "deletedAt" IS NULL AND cnp IS NOT NULL;

ALTER TABLE "Counterparty" ADD CONSTRAINT "Counterparty_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Counterparty" ADD CONSTRAINT "Counterparty_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create a stable unified identity for every existing Person. This does not
-- alter the person's User or Wallet and is safe to run before API adoption.
INSERT INTO "Counterparty" (
  "id", "type", "personId", "isActive", "createdAt", "updatedAt"
)
SELECT
  'counterparty_person_' || md5(person."id"),
  'PERSON'::"CounterpartyType",
  person."id",
  person."deletedAt" IS NULL,
  person."createdAt",
  CURRENT_TIMESTAMP
FROM "Person" AS person;

-- New nullable links coexist with legacy User links. Existing history is
-- backfilled where the referenced User has a Person; all original columns and
-- relations remain unchanged for backwards compatibility.
ALTER TABLE "MoneyTransaction"
  ADD COLUMN "counterpartyId" TEXT,
  ADD COLUMN "recipientCounterpartyId" TEXT,
  ADD COLUMN "debtorCounterpartyId" TEXT,
  ADD COLUMN "creditorCounterpartyId" TEXT;

UPDATE "MoneyTransaction" AS transaction
SET "counterpartyId" = counterparty."id"
FROM "Person" AS person
JOIN "Counterparty" AS counterparty ON counterparty."personId" = person."id"
WHERE transaction."counterpartyUserId" = person."userId";

UPDATE "MoneyTransaction" AS transaction
SET "recipientCounterpartyId" = counterparty."id"
FROM "Person" AS person
JOIN "Counterparty" AS counterparty ON counterparty."personId" = person."id"
WHERE transaction."recipientUserId" = person."userId";

UPDATE "MoneyTransaction" AS transaction
SET "debtorCounterpartyId" = counterparty."id"
FROM "Person" AS person
JOIN "Counterparty" AS counterparty ON counterparty."personId" = person."id"
WHERE transaction."debtorUserId" = person."userId";

UPDATE "MoneyTransaction" AS transaction
SET "creditorCounterpartyId" = counterparty."id"
FROM "Person" AS person
JOIN "Counterparty" AS counterparty ON counterparty."personId" = person."id"
WHERE transaction."creditorUserId" = person."userId";

CREATE INDEX "MoneyTransaction_counterpartyId_occurredAt_idx"
  ON "MoneyTransaction"("counterpartyId", "occurredAt");
CREATE INDEX "MoneyTransaction_recipientCounterpartyId_occurredAt_idx"
  ON "MoneyTransaction"("recipientCounterpartyId", "occurredAt");
CREATE INDEX "MoneyTransaction_debtorCounterpartyId_creditorCounterpartyId_occurredAt_idx"
  ON "MoneyTransaction"("debtorCounterpartyId", "creditorCounterpartyId", "occurredAt");

ALTER TABLE "MoneyTransaction" ADD CONSTRAINT "MoneyTransaction_counterpartyId_fkey"
  FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MoneyTransaction" ADD CONSTRAINT "MoneyTransaction_recipientCounterpartyId_fkey"
  FOREIGN KEY ("recipientCounterpartyId") REFERENCES "Counterparty"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MoneyTransaction" ADD CONSTRAINT "MoneyTransaction_debtorCounterpartyId_fkey"
  FOREIGN KEY ("debtorCounterpartyId") REFERENCES "Counterparty"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MoneyTransaction" ADD CONSTRAINT "MoneyTransaction_creditorCounterpartyId_fkey"
  FOREIGN KEY ("creditorCounterpartyId") REFERENCES "Counterparty"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
