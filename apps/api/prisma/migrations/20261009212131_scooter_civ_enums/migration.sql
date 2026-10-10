-- Preserve all existing CIV text when introducing database enums.

-- CreateEnum
CREATE TYPE "ScooterVehicleCategory" AS ENUM ('L1e', 'L2e', 'L3e', 'L4e', 'L5e', 'L6e', 'L7e', 'other');

-- CreateEnum
CREATE TYPE "ScooterUseCategory" AS ENUM ('motorcycle', 'other');

-- CreateEnum
CREATE TYPE "ScooterBodyType" AS ENUM ('two_wheel_moped', 'two_wheel_motorcycle', 'other');

-- CreateEnum
CREATE TYPE "ScooterFuelType" AS ENUM ('petrol', 'diesel', 'electric', 'petrol_electric', 'diesel_electric', 'other');


ALTER TABLE "Scooter" ADD COLUMN "vehicleCategoryOther" TEXT;

UPDATE "Scooter" SET "vehicleCategoryOther" = "vehicleCategory"
WHERE "vehicleCategory" IS NOT NULL AND lower(btrim("vehicleCategory")) NOT IN ('l1e', 'l2e', 'l3e', 'l4e', 'l5e', 'l6e', 'l7e');

ALTER TABLE "Scooter" ALTER COLUMN "vehicleCategory" TYPE "ScooterVehicleCategory" USING (
CASE WHEN "vehicleCategory" IS NULL THEN NULL
  WHEN lower(btrim("vehicleCategory")) = 'l1e' THEN 'L1e'
  WHEN lower(btrim("vehicleCategory")) = 'l2e' THEN 'L2e'
  WHEN lower(btrim("vehicleCategory")) = 'l3e' THEN 'L3e'
  WHEN lower(btrim("vehicleCategory")) = 'l4e' THEN 'L4e'
  WHEN lower(btrim("vehicleCategory")) = 'l5e' THEN 'L5e'
  WHEN lower(btrim("vehicleCategory")) = 'l6e' THEN 'L6e'
  WHEN lower(btrim("vehicleCategory")) = 'l7e' THEN 'L7e'
  ELSE 'other'
END)::"ScooterVehicleCategory";

ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_vehicleCategory_other_check" CHECK (
  ("vehicleCategory" = 'other' AND "vehicleCategoryOther" IS NOT NULL)
  OR ("vehicleCategory" IS DISTINCT FROM 'other' AND "vehicleCategoryOther" IS NULL)
);

ALTER TABLE "Scooter" ADD COLUMN "nationalCategoryOther" TEXT;

UPDATE "Scooter" SET "nationalCategoryOther" = "nationalCategory"
WHERE "nationalCategory" IS NOT NULL AND lower(btrim("nationalCategory")) NOT IN ('motorcycle', 'motociclu');

ALTER TABLE "Scooter" ALTER COLUMN "nationalCategory" TYPE "ScooterUseCategory" USING (
CASE WHEN "nationalCategory" IS NULL THEN NULL
  WHEN lower(btrim("nationalCategory")) = 'motorcycle' THEN 'motorcycle'
  WHEN lower(btrim("nationalCategory")) = 'motociclu' THEN 'motorcycle'
  ELSE 'other'
END)::"ScooterUseCategory";

ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_nationalCategory_other_check" CHECK (
  ("nationalCategory" = 'other' AND "nationalCategoryOther" IS NOT NULL)
  OR ("nationalCategory" IS DISTINCT FROM 'other' AND "nationalCategoryOther" IS NULL)
);

ALTER TABLE "Scooter" ADD COLUMN "bodyTypeOther" TEXT;

UPDATE "Scooter" SET "bodyTypeOther" = "bodyType"
WHERE "bodyType" IS NOT NULL AND lower(btrim("bodyType")) NOT IN ('two_wheel_moped', 'l1e-b moped cu doua roti', 'l1e-b moped cu două roți', 'two_wheel_motorcycle', 'l3e motocicleta cu doua roti', 'l3e motocicletă cu două roți');

ALTER TABLE "Scooter" ALTER COLUMN "bodyType" TYPE "ScooterBodyType" USING (
CASE WHEN "bodyType" IS NULL THEN NULL
  WHEN lower(btrim("bodyType")) = 'two_wheel_moped' THEN 'two_wheel_moped'
  WHEN lower(btrim("bodyType")) = 'l1e-b moped cu doua roti' THEN 'two_wheel_moped'
  WHEN lower(btrim("bodyType")) = 'l1e-b moped cu două roți' THEN 'two_wheel_moped'
  WHEN lower(btrim("bodyType")) = 'two_wheel_motorcycle' THEN 'two_wheel_motorcycle'
  WHEN lower(btrim("bodyType")) = 'l3e motocicleta cu doua roti' THEN 'two_wheel_motorcycle'
  WHEN lower(btrim("bodyType")) = 'l3e motocicletă cu două roți' THEN 'two_wheel_motorcycle'
  ELSE 'other'
END)::"ScooterBodyType";

ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_bodyType_other_check" CHECK (
  ("bodyType" = 'other' AND "bodyTypeOther" IS NOT NULL)
  OR ("bodyType" IS DISTINCT FROM 'other' AND "bodyTypeOther" IS NULL)
);

ALTER TABLE "Scooter" ADD COLUMN "fuelTypeOther" TEXT;

UPDATE "Scooter" SET "fuelTypeOther" = "fuelType"
WHERE "fuelType" IS NOT NULL AND lower(btrim("fuelType")) NOT IN ('petrol', 'benzina', 'benzină', 'diesel', 'motorina', 'motorină', 'electric', 'electricity', 'electricitate', 'petrol_electric', 'benzina + electric', 'diesel_electric', 'motorina + electric');

ALTER TABLE "Scooter" ALTER COLUMN "fuelType" TYPE "ScooterFuelType" USING (
CASE WHEN "fuelType" IS NULL THEN NULL
  WHEN lower(btrim("fuelType")) = 'petrol' THEN 'petrol'
  WHEN lower(btrim("fuelType")) = 'benzina' THEN 'petrol'
  WHEN lower(btrim("fuelType")) = 'benzină' THEN 'petrol'
  WHEN lower(btrim("fuelType")) = 'diesel' THEN 'diesel'
  WHEN lower(btrim("fuelType")) = 'motorina' THEN 'diesel'
  WHEN lower(btrim("fuelType")) = 'motorină' THEN 'diesel'
  WHEN lower(btrim("fuelType")) = 'electric' THEN 'electric'
  WHEN lower(btrim("fuelType")) = 'electricity' THEN 'electric'
  WHEN lower(btrim("fuelType")) = 'electricitate' THEN 'electric'
  WHEN lower(btrim("fuelType")) = 'petrol_electric' THEN 'petrol_electric'
  WHEN lower(btrim("fuelType")) = 'benzina + electric' THEN 'petrol_electric'
  WHEN lower(btrim("fuelType")) = 'diesel_electric' THEN 'diesel_electric'
  WHEN lower(btrim("fuelType")) = 'motorina + electric' THEN 'diesel_electric'
  ELSE 'other'
END)::"ScooterFuelType";

ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_fuelType_other_check" CHECK (
  ("fuelType" = 'other' AND "fuelTypeOther" IS NOT NULL)
  OR ("fuelType" IS DISTINCT FROM 'other' AND "fuelTypeOther" IS NULL)
);

UPDATE "Scooter" SET "nationalRegistryNumber" = upper("nationalRegistryNumber") WHERE "nationalRegistryNumber" IS NOT NULL;
