CREATE TABLE "ScooterPhoto" (
    "id" TEXT NOT NULL,
    "scooterId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "caption" TEXT,
    "position" INTEGER NOT NULL,
    "showToCustomers" BOOLEAN NOT NULL DEFAULT false,
    "internalCover" BOOLEAN NOT NULL DEFAULT false,
    "customerCover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "ScooterPhoto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScooterPhoto_position_nonnegative" CHECK ("position" >= 0),
    CONSTRAINT "ScooterPhoto_customer_cover_visible" CHECK (NOT "customerCover" OR "showToCustomers")
);
CREATE UNIQUE INDEX "ScooterPhoto_assetId_key" ON "ScooterPhoto"("assetId");
CREATE INDEX "ScooterPhoto_scooterId_deletedAt_position_idx" ON "ScooterPhoto"("scooterId", "deletedAt", "position");
CREATE UNIQUE INDEX "ScooterPhoto_internal_cover_key" ON "ScooterPhoto"("scooterId") WHERE "internalCover" = true AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "ScooterPhoto_customer_cover_key" ON "ScooterPhoto"("scooterId") WHERE "customerCover" = true AND "deletedAt" IS NULL;
ALTER TABLE "ScooterPhoto" ADD CONSTRAINT "ScooterPhoto_scooterId_fkey" FOREIGN KEY ("scooterId") REFERENCES "Scooter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScooterPhoto" ADD CONSTRAINT "ScooterPhoto_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
