BEGIN;

-- Internal numbers can now be edited. Keep their positive check and global
-- unique index; application transactions serialize changes with allocation.
DROP TRIGGER "Scooter_fleetNumber_immutable" ON "Scooter";
DROP FUNCTION prevent_scooter_fleet_number_change();

COMMIT;
