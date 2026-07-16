-- Preserve existing technical and registration status data under the new names.
ALTER TABLE "Scooter" RENAME COLUMN "cylinderCapacityCc" TO "engineCc";
ALTER TABLE "Scooter" RENAME COLUMN "registrationStatus" TO "registrationType";

-- Add registration and licence metadata.
ALTER TABLE "Scooter" ADD COLUMN "powerKw" DOUBLE PRECISION;
ALTER TABLE "Scooter" ADD COLUMN "plateNumber" TEXT;
ALTER TABLE "Scooter" ADD COLUMN "plateNumberNormalized" TEXT;
ALTER TABLE "Scooter" ADD COLUMN "registeredOn" DATE;
ALTER TABLE "Scooter" ADD COLUMN "registrationExpiresOn" DATE;
ALTER TABLE "Scooter" ADD COLUMN "requiredDriverLicenseType" TEXT NOT NULL DEFAULT 'none';

DROP INDEX "Scooter_registrationStatus_deletedAt_idx";
CREATE INDEX "Scooter_registrationType_deletedAt_idx" ON "Scooter"("registrationType", "deletedAt");
CREATE INDEX "Scooter_requiredDriverLicenseType_deletedAt_idx" ON "Scooter"("requiredDriverLicenseType", "deletedAt");
CREATE UNIQUE INDEX "Scooter_active_plateNumberNormalized_key" ON "Scooter"("plateNumberNormalized")
WHERE "deletedAt" IS NULL AND "plateNumberNormalized" IS NOT NULL;

DROP INDEX "Scooter_search_trgm_idx";
CREATE INDEX "Scooter_search_trgm_idx" ON "Scooter" USING gin (
  lower(
    coalesce("vin", '') || ' ' ||
    coalesce("brand", '') || ' ' ||
    coalesce("model", '') || ' ' ||
    coalesce("color", '') || ' ' ||
    coalesce("manufactureYear"::text, '') || ' ' ||
    coalesce("powertrainType", '') || ' ' ||
    coalesce("engineCc"::text, '') || ' ' ||
    coalesce(("powerKw"::numeric(10, 2))::text, '') || ' ' ||
    coalesce("registrationType", '') || ' ' ||
    coalesce("plateNumber", '') || ' ' ||
    coalesce("plateNumberNormalized", '') || ' ' ||
    coalesce("requiredDriverLicenseType", '') || ' ' ||
    coalesce("notes", '')
  ) gin_trgm_ops
);
