BEGIN;
CREATE TYPE "ScooterFuelSystem" AS ENUM ('injection', 'carburetor');
ALTER TABLE "Scooter" ADD COLUMN "fuelSystem" "ScooterFuelSystem";
COMMIT;
