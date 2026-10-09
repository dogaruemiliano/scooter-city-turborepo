-- Preserve existing scooter records and permit incomplete technical data.
BEGIN;

ALTER TABLE "Scooter" RENAME COLUMN "engineType" TO "engineCode";
ALTER TABLE "Scooter" RENAME COLUMN "engineCc" TO "engineDisplacementCc";
ALTER TABLE "Scooter" RENAME COLUMN "plateNumber" TO "registrationNumber";
ALTER TABLE "Scooter" RENAME COLUMN "plateNumberNormalized" TO "registrationNumberNormalized";
ALTER TABLE "Scooter" RENAME COLUMN "registeredOn" TO "registrationDate";
ALTER TABLE "Scooter" RENAME COLUMN "registrationExpiresOn" TO "temporaryRegistrationExpiresAt";
ALTER TABLE "Scooter" RENAME COLUMN "requiredDriverLicenseType" TO "requiredLicenseCategory";

ALTER INDEX "Scooter_active_plateNumberNormalized_key" RENAME TO "Scooter_active_registrationNumberNormalized_key";
ALTER INDEX "Scooter_requiredDriverLicenseType_deletedAt_idx" RENAME TO "Scooter_requiredLicenseCategory_deletedAt_idx";

CREATE TYPE "PowertrainType" AS ENUM ('electric', 'combustion');
CREATE TYPE "ScooterRegistrationType" AS ENUM ('unregistered', 'national', 'local', 'temporary');
CREATE TYPE "DrivingLicenseCategory" AS ENUM ('none', 'AM', 'A1', 'A2', 'A');

ALTER TABLE "Scooter"
  ALTER COLUMN "model" DROP NOT NULL,
  ALTER COLUMN "manufactureYear" DROP NOT NULL,
  ALTER COLUMN "powerKw" TYPE DECIMAL(65,30) USING "powerKw"::numeric,
  ALTER COLUMN "registrationType" DROP DEFAULT,
  ALTER COLUMN "requiredLicenseCategory" DROP DEFAULT,
  ALTER COLUMN "powertrainType" TYPE "PowertrainType" USING "powertrainType"::"PowertrainType",
  ALTER COLUMN "registrationType" TYPE "ScooterRegistrationType" USING "registrationType"::"ScooterRegistrationType",
  ALTER COLUMN "requiredLicenseCategory" TYPE "DrivingLicenseCategory" USING "requiredLicenseCategory"::"DrivingLicenseCategory";

ALTER TABLE "Scooter"
  ALTER COLUMN "registrationType" SET DEFAULT 'unregistered',
  ALTER COLUMN "requiredLicenseCategory" SET DEFAULT 'none',
  ADD COLUMN "variant" TEXT,
  ADD COLUMN "version" TEXT,
  ADD COLUMN "commercialName" TEXT,
  ADD COLUMN "vehicleCategory" TEXT,
  ADD COLUMN "nationalCategory" TEXT,
  ADD COLUMN "bodyType" TEXT,
  ADD COLUMN "typeApprovalNumber" TEXT,
  ADD COLUMN "nationalRegistryNumber" TEXT,
  ADD COLUMN "seatsCount" INTEGER,
  ADD COLUMN "engineSerialNumber" TEXT,
  ADD COLUMN "ratedEngineRpm" INTEGER,
  ADD COLUMN "fuelType" TEXT,
  ADD COLUMN "propulsionSystem" TEXT,
  ADD COLUMN "electricMotorPowerKw" DECIMAL(65,30),
  ADD COLUMN "powerToWeightRatioKwKg" DECIMAL(65,30),
  ADD COLUMN "maxSpeedKmh" INTEGER,
  ADD COLUMN "emissionsStandard" TEXT,
  ADD COLUMN "curbWeightKg" INTEGER,
  ADD COLUMN "actualWeightKg" INTEGER,
  ADD COLUMN "maxTechnicallyPermissibleMassKg" INTEGER,
  ADD COLUMN "maxTrainMassKg" INTEGER,
  ADD COLUMN "maxAxle1MassKg" INTEGER,
  ADD COLUMN "maxAxle2MassKg" INTEGER,
  ADD COLUMN "axlesCount" INTEGER,
  ADD COLUMN "lengthMm" INTEGER,
  ADD COLUMN "widthMm" INTEGER,
  ADD COLUMN "heightMm" INTEGER,
  ADD COLUMN "wheelbaseMm" INTEGER,
  ADD COLUMN "frontTyreSpecification" TEXT,
  ADD COLUMN "rearTyreSpecification" TEXT,
  ADD COLUMN "frontSuspension" TEXT,
  ADD COLUMN "rearSuspension" TEXT,
  ADD COLUMN "fuelTankCapacityLiters" DECIMAL(65,30),
  ADD COLUMN "registrationCertificateNumber" TEXT;

COMMIT;
