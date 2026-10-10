-- CreateEnum
CREATE TYPE "CivDocumentVersion" AS ENUM ('1993', '2016', '2024', 'unknown');

-- AlterEnum
ALTER TYPE "PowertrainType" ADD VALUE 'unpowered';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ScooterVehicleCategory" ADD VALUE 'M1';
ALTER TYPE "ScooterVehicleCategory" ADD VALUE 'M2';
ALTER TYPE "ScooterVehicleCategory" ADD VALUE 'M3';
ALTER TYPE "ScooterVehicleCategory" ADD VALUE 'N1';
ALTER TYPE "ScooterVehicleCategory" ADD VALUE 'N2';
ALTER TYPE "ScooterVehicleCategory" ADD VALUE 'N3';
ALTER TYPE "ScooterVehicleCategory" ADD VALUE 'O1';
ALTER TYPE "ScooterVehicleCategory" ADD VALUE 'O2';
ALTER TYPE "ScooterVehicleCategory" ADD VALUE 'O3';
ALTER TYPE "ScooterVehicleCategory" ADD VALUE 'O4';

-- AlterTable
ALTER TABLE "Scooter" ADD COLUMN     "brakedTrailerMassKg" INTEGER,
ADD COLUMN     "civMentions" TEXT,
ADD COLUMN     "co2EmissionsGKm" DECIMAL(65,30),
ADD COLUMN     "couplingPointMassKg" INTEGER,
ADD COLUMN     "driveType" TEXT,
ADD COLUMN     "drivingNoiseDb" DECIMAL(65,30),
ADD COLUMN     "maxAxle3MassKg" INTEGER,
ADD COLUMN     "maxAxle4MassKg" INTEGER,
ADD COLUMN     "maxAxle5MassKg" INTEGER,
ADD COLUMN     "noiseMeasurementRpm" INTEGER,
ADD COLUMN     "standingCapacity" INTEGER,
ADD COLUMN     "stationaryNoiseDb" DECIMAL(65,30),
ADD COLUMN     "unbrakedTrailerMassKg" INTEGER,
ADD COLUMN     "vehicleClass" TEXT;

-- CreateTable
CREATE TABLE "VehicleCivDocument" (
    "id" TEXT NOT NULL,
    "scooterId" TEXT NOT NULL,
    "version" "CivDocumentVersion" NOT NULL DEFAULT 'unknown',
    "issuedAt" DATE,
    "issuingAuthority" TEXT,
    "rawFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleCivDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CivVocabularyEntry" (
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "CivVocabularyEntry_pkey" PRIMARY KEY ("field","value")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCivDocument_scooterId_key" ON "VehicleCivDocument"("scooterId");

-- AddForeignKey
ALTER TABLE "VehicleCivDocument" ADD CONSTRAINT "VehicleCivDocument_scooterId_fkey" FOREIGN KEY ("scooterId") REFERENCES "Scooter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing documents have no proven layout version. Never infer it from dates.
INSERT INTO "VehicleCivDocument" ("id", "scooterId", "version", "updatedAt")
SELECT 'civ_' || s."id", s."id", 'unknown', CURRENT_TIMESTAMP
FROM "Scooter" s
WHERE s."civNumber" IS NOT NULL OR EXISTS (
  SELECT 1 FROM "ScooterDocument" d WHERE d."scooterId" = s."id" AND d."type" = 'civ'
);
INSERT INTO "CivVocabularyEntry" ("field", "value") SELECT DISTINCT 'vehicleClass', "vehicleClass" FROM "Scooter" WHERE "vehicleClass" IS NOT NULL AND length(trim("vehicleClass")) > 0 ON CONFLICT DO NOTHING;
INSERT INTO "CivVocabularyEntry" ("field", "value") SELECT DISTINCT 'driveType', "driveType" FROM "Scooter" WHERE "driveType" IS NOT NULL AND length(trim("driveType")) > 0 ON CONFLICT DO NOTHING;
INSERT INTO "CivVocabularyEntry" ("field", "value") SELECT DISTINCT 'color', "color" FROM "Scooter" WHERE "color" IS NOT NULL AND length(trim("color")) > 0 ON CONFLICT DO NOTHING;
INSERT INTO "CivVocabularyEntry" ("field", "value") SELECT DISTINCT 'frontSuspension', "frontSuspension" FROM "Scooter" WHERE "frontSuspension" IS NOT NULL AND length(trim("frontSuspension")) > 0 ON CONFLICT DO NOTHING;
INSERT INTO "CivVocabularyEntry" ("field", "value") SELECT DISTINCT 'rearSuspension', "rearSuspension" FROM "Scooter" WHERE "rearSuspension" IS NOT NULL AND length(trim("rearSuspension")) > 0 ON CONFLICT DO NOTHING;
INSERT INTO "CivVocabularyEntry" ("field", "value") SELECT DISTINCT 'emissionsStandard', "emissionsStandard" FROM "Scooter" WHERE "emissionsStandard" IS NOT NULL AND length(trim("emissionsStandard")) > 0 ON CONFLICT DO NOTHING;
INSERT INTO "CivVocabularyEntry" ("field", "value") SELECT DISTINCT 'nationalEmissionsCode', "nationalEmissionsCode" FROM "Scooter" WHERE "nationalEmissionsCode" IS NOT NULL AND length(trim("nationalEmissionsCode")) > 0 ON CONFLICT DO NOTHING;
ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_maxAxle3MassKg_nonnegative" CHECK ("maxAxle3MassKg" >= 0);
ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_maxAxle4MassKg_nonnegative" CHECK ("maxAxle4MassKg" >= 0);
ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_maxAxle5MassKg_nonnegative" CHECK ("maxAxle5MassKg" >= 0);
ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_brakedTrailerMassKg_nonnegative" CHECK ("brakedTrailerMassKg" >= 0);
ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_unbrakedTrailerMassKg_nonnegative" CHECK ("unbrakedTrailerMassKg" >= 0);
ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_couplingPointMassKg_nonnegative" CHECK ("couplingPointMassKg" >= 0);
ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_standingCapacity_nonnegative" CHECK ("standingCapacity" >= 0);
ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_noiseMeasurementRpm_nonnegative" CHECK ("noiseMeasurementRpm" >= 0);
ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_stationaryNoiseDb_nonnegative" CHECK ("stationaryNoiseDb" >= 0);
ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_drivingNoiseDb_nonnegative" CHECK ("drivingNoiseDb" >= 0);
ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_co2EmissionsGKm_nonnegative" CHECK ("co2EmissionsGKm" >= 0);
