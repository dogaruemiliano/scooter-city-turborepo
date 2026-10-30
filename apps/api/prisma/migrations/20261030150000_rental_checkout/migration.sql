ALTER TABLE "Person" ADD COLUMN "citizenship" TEXT;

ALTER TABLE "Scooter"
  ADD COLUMN "commercialCategory" TEXT,
  ADD COLUMN "limiterKind" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "limiterKmh" INTEGER,
  ADD COLUMN "maxSpeedSource" TEXT,
  ADD COLUMN "configurationEvidence" TEXT,
  ADD CONSTRAINT "Scooter_commercial_category_check" CHECK ("commercialCategory" IS NULL OR "commercialCategory" IN ('without_license', 'with_license')),
  ADD CONSTRAINT "Scooter_limiter_kind_check" CHECK ("limiterKind" IN ('UNKNOWN', 'LIMITED', 'NO_LIMITER')),
  ADD CONSTRAINT "Scooter_limiter_configuration_check" CHECK (("limiterKind" = 'UNKNOWN') OR ("maxSpeedKmh" > 0 AND NULLIF(TRIM("maxSpeedSource"), '') IS NOT NULL AND NULLIF(TRIM("configurationEvidence"), '') IS NOT NULL AND (("limiterKind" = 'LIMITED' AND "limiterKmh" > 0 AND "limiterKmh" <= "maxSpeedKmh") OR ("limiterKind" = 'NO_LIMITER' AND "limiterKmh" IS NULL))));

ALTER TABLE "Rental"
  ADD COLUMN "workflowVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "termsSnapshot" JSONB,
  ADD COLUMN "agreementStartsAt" TIMESTAMP(3),
  ADD COLUMN "agreementEndsAt" TIMESTAMP(3),
  ADD COLUMN "billingAnchorAt" TIMESTAMP(3),
  ADD COLUMN "nextPaymentDueAt" TIMESTAMP(3),
  ADD COLUMN "contractTimezone" TEXT NOT NULL DEFAULT 'Europe/Bucharest',
  ADD COLUMN "checkoutDraft" JSONB;

CREATE TABLE "RentalInspection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "rentalId" TEXT NOT NULL REFERENCES "Rental"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "scooterId" TEXT NOT NULL REFERENCES "Scooter"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "eventType" TEXT NOT NULL CHECK ("eventType" IN ('handover', 'return')),
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'confirmed')),
  "dataSnapshot" JSONB NOT NULL,
  "scooterUpdatedAt" TIMESTAMP(3) NOT NULL,
  "inspectedByUserId" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "RentalInspection_rentalId_version_key" ON "RentalInspection"("rentalId", "version");
CREATE INDEX "RentalInspection_rentalId_eventType_status_version_idx" ON "RentalInspection"("rentalId", "eventType", "status", "version");

CREATE TABLE "RentalPayment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "rentalId" TEXT NOT NULL REFERENCES "Rental"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "purpose" TEXT NOT NULL CHECK ("purpose" IN ('rent', 'deposit')),
  "method" TEXT NOT NULL CHECK ("method" IN ('cash', 'transfer', 'card')),
  "amountMinor" INTEGER NOT NULL CHECK ("amountMinor" > 0),
  "status" TEXT NOT NULL DEFAULT 'confirmed' CHECK ("status" IN ('confirmed', 'refunded')),
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "confirmedByUserId" TEXT NOT NULL,
  "evidenceReference" TEXT NOT NULL,
  "coverageStartsAt" TIMESTAMP(3),
  "coverageEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RentalPayment_rentalId_purpose_status_idx" ON "RentalPayment"("rentalId", "purpose", "status");

CREATE TABLE "RentalParticipant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "rentalId" TEXT NOT NULL REFERENCES "Rental"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "personId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "role" TEXT NOT NULL CHECK ("role" IN ('lessee', 'driver')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "RentalParticipant_rentalId_personId_role_key" ON "RentalParticipant"("rentalId", "personId", "role");
