-- Preserve unknown equipment status for existing scooters.
ALTER TABLE "Scooter"
ADD COLUMN "hasPhoneStand" BOOLEAN,
ADD COLUMN "hasChargingOutlet" BOOLEAN;
