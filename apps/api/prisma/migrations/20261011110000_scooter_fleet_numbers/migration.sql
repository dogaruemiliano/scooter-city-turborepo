BEGIN;

LOCK TABLE "Scooter", "ScooterDocument" IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE "Scooter" ADD COLUMN "fleetNumber" INTEGER;

-- One-time import of legacy numbers in document names such as CIV-004-AGM.pdf.
-- Match the scooter's actual brand code; do not infer numbers from VINs/plates.
CREATE TEMP TABLE legacy_fleet_numbers ON COMMIT DROP AS
SELECT DISTINCT s.id, parts[2]::bigint AS number
FROM "Scooter" s
JOIN "ScooterBrand" b ON b.id = s."brandId"
JOIN "ScooterDocument" d ON d."scooterId" = s.id AND d."deletedAt" IS NULL
CROSS JOIN LATERAL regexp_matches(
  upper(d."fileName"),
  '(^|[-_[:space:]])([0-9]{3,10})[-_[:space:]]+([A-Z0-9]{2,6})([._[:space:]-]|$)',
  'g'
) AS parts
WHERE parts[3] = upper(b.code);

-- Stop rather than silently renumber an ambiguous legacy record.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM legacy_fleet_numbers WHERE number < 1 OR number > 2147483647)
     OR EXISTS (SELECT 1 FROM legacy_fleet_numbers GROUP BY id HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM legacy_fleet_numbers GROUP BY number HAVING count(*) > 1)
  THEN
    RAISE EXCEPTION 'Conflicting legacy scooter fleet numbers; reconcile document filenames before migrating';
  END IF;
END $$;

UPDATE "Scooter" s SET "fleetNumber" = l.number::integer
FROM legacy_fleet_numbers l WHERE l.id = s.id;

-- Number all remaining records (including soft-deleted ones) deterministically,
-- skipping reserved legacy numbers. N available candidates suffice for N rows.
WITH unnumbered AS (
  SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS position
  FROM "Scooter" WHERE "fleetNumber" IS NULL
), available AS (
  SELECT candidate, row_number() OVER (ORDER BY candidate) AS position
  FROM generate_series(1, (SELECT count(*)::integer FROM "Scooter")) AS candidate
  WHERE NOT EXISTS (SELECT 1 FROM "Scooter" WHERE "fleetNumber" = candidate)
)
UPDATE "Scooter" s SET "fleetNumber" = a.candidate
FROM unnumbered u JOIN available a USING (position)
WHERE s.id = u.id;

ALTER TABLE "Scooter" ALTER COLUMN "fleetNumber" SET NOT NULL;
ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_fleetNumber_positive" CHECK ("fleetNumber" > 0);
CREATE UNIQUE INDEX "Scooter_fleetNumber_key" ON "Scooter"("fleetNumber");

CREATE TABLE "ScooterFleetCounter" (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  "lastNumber" INTEGER NOT NULL DEFAULT 0 CHECK ("lastNumber" >= 0)
);
INSERT INTO "ScooterFleetCounter" (id, "lastNumber")
SELECT 1, coalesce(max("fleetNumber"), 0) FROM "Scooter";

CREATE FUNCTION prevent_scooter_fleet_number_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."fleetNumber" IS DISTINCT FROM OLD."fleetNumber" THEN
    RAISE EXCEPTION 'A scooter fleet number cannot be changed';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Scooter_fleetNumber_immutable"
BEFORE UPDATE OF "fleetNumber" ON "Scooter"
FOR EACH ROW EXECUTE FUNCTION prevent_scooter_fleet_number_change();

COMMIT;
