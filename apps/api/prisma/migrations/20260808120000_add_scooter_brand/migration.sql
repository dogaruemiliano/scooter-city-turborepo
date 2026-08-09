-- Introduces ScooterBrand as a first-class entity (name + curated code) and
-- backfills it from the existing free-text Scooter.brand column, then swaps
-- Scooter.brand for a brandId FK. Generated codes below are only a starting
-- point (uppercased first 3 letters, deduplicated) — operators are expected
-- to review/rename them via the new brand management UI.

CREATE TABLE "ScooterBrand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScooterBrand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScooterBrand_name_key" ON "ScooterBrand"("name");
CREATE UNIQUE INDEX "ScooterBrand_code_key" ON "ScooterBrand"("code");

-- Backfill one ScooterBrand row per distinct existing Scooter.brand value,
-- deriving a starting code and deduplicating collisions with a numeric suffix.
DO $$
DECLARE
  brand_name TEXT;
  base_code TEXT;
  candidate_code TEXT;
  suffix INT;
BEGIN
  FOR brand_name IN
    SELECT DISTINCT "brand" FROM "Scooter" ORDER BY "brand"
  LOOP
    base_code := upper(left(regexp_replace(trim(brand_name), '[^a-zA-Z]', '', 'g'), 3));
    IF base_code IS NULL OR length(base_code) = 0 THEN
      base_code := 'BRD';
    END IF;
    base_code := rpad(base_code, 3, 'X');

    candidate_code := base_code;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM "ScooterBrand" WHERE "code" = candidate_code) LOOP
      suffix := suffix + 1;
      candidate_code := base_code || suffix::text;
    END LOOP;

    INSERT INTO "ScooterBrand" ("id", "name", "code", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, brand_name, candidate_code, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  END LOOP;
END $$;

-- Point Scooter rows at their new brand, then drop the old free-text column.
ALTER TABLE "Scooter" ADD COLUMN "brandId" TEXT;

UPDATE "Scooter" s
SET "brandId" = sb."id"
FROM "ScooterBrand" sb
WHERE sb."name" = s."brand";

ALTER TABLE "Scooter" ALTER COLUMN "brandId" SET NOT NULL;

DROP INDEX IF EXISTS "Scooter_brand_model_idx";
CREATE INDEX "Scooter_brandId_model_idx" ON "Scooter"("brandId", "model");

ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "ScooterBrand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Scooter" DROP COLUMN "brand";
