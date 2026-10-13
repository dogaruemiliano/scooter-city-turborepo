BEGIN;

-- One gallery cover, independent public visibility, and future rental evidence.
CREATE TYPE "ScooterPhotoType" AS ENUM ('GALLERY', 'GALLERY_COVER', 'RENTAL_BEFORE', 'RENTAL_AFTER');
ALTER TABLE "ScooterPhoto" ADD COLUMN "type" "ScooterPhotoType" NOT NULL DEFAULT 'GALLERY',
    ADD COLUMN "rentalId" TEXT;

-- Prefer the existing internal cover; fall back to the public cover, then first photo.
-- Every active gallery with photos receives exactly one cover, without losing assets.
WITH ranked AS (
    SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "scooterId"
        ORDER BY "internalCover" DESC, "customerCover" DESC, "position", "createdAt", "id"
    ) AS rank
    FROM "ScooterPhoto" WHERE "deletedAt" IS NULL
)
UPDATE "ScooterPhoto" SET "type" = 'GALLERY_COVER'
FROM ranked WHERE "ScooterPhoto"."id" = ranked."id" AND ranked.rank = 1;

ALTER TABLE "ScooterPhoto" DROP CONSTRAINT "ScooterPhoto_customer_cover_visible";
DROP INDEX "ScooterPhoto_internal_cover_key";
DROP INDEX "ScooterPhoto_customer_cover_key";
ALTER TABLE "ScooterPhoto" RENAME COLUMN "showToCustomers" TO "isPublic";
ALTER TABLE "ScooterPhoto" DROP COLUMN "internalCover", DROP COLUMN "customerCover";
DROP INDEX "ScooterPhoto_scooterId_deletedAt_position_idx";
CREATE INDEX "ScooterPhoto_scooterId_type_deletedAt_position_idx" ON "ScooterPhoto"("scooterId", "type", "deletedAt", "position");
CREATE INDEX "ScooterPhoto_rentalId_type_createdAt_idx" ON "ScooterPhoto"("rentalId", "type", "createdAt");
CREATE UNIQUE INDEX "ScooterPhoto_gallery_cover_key" ON "ScooterPhoto"("scooterId") WHERE "deletedAt" IS NULL AND "type" = 'GALLERY_COVER';

-- Composite ownership prevents rental evidence from referencing a different scooter.
CREATE UNIQUE INDEX "Rental_id_scooterId_key" ON "Rental"("id", "scooterId");
ALTER TABLE "ScooterPhoto" ADD CONSTRAINT "ScooterPhoto_rentalId_scooterId_fkey"
    FOREIGN KEY ("rentalId", "scooterId") REFERENCES "Rental"("id", "scooterId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScooterPhoto" ADD CONSTRAINT "ScooterPhoto_type_rental_scope" CHECK (
    ("type" IN ('GALLERY', 'GALLERY_COVER') AND "rentalId" IS NULL) OR
    ("type" IN ('RENTAL_BEFORE', 'RENTAL_AFTER') AND "rentalId" IS NOT NULL)
);

COMMIT;
