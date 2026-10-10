-- Original extraction evidence belongs to its source file, independently of CIV metadata.
ALTER TYPE "ScooterDocumentType" ADD VALUE 'import_document';

ALTER TABLE "Scooter" DROP COLUMN "civMentions",
ADD COLUMN "actualMaxSpeedKmh" INTEGER,
ADD COLUMN "hasGps" BOOLEAN,
ADD COLUMN "odometerWorking" BOOLEAN,
ADD COLUMN "speedometerWorking" BOOLEAN;

ALTER TABLE "Scooter"
ADD CONSTRAINT "Scooter_actualMaxSpeedKmh_nonnegative"
CHECK ("actualMaxSpeedKmh" >= 0);

ALTER TABLE "ScooterDocument" ADD COLUMN "extractedData" JSONB;
