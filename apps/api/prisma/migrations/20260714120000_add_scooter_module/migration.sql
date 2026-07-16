CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateTable
CREATE TABLE "Scooter" (
    "id" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "color" TEXT,
    "manufactureYear" INTEGER NOT NULL,
    "powertrainType" TEXT NOT NULL,
    "cylinderCapacityCc" INTEGER,
    "purchasedOn" DATE NOT NULL,
    "registrationStatus" TEXT NOT NULL DEFAULT 'unregistered',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Scooter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Scooter_vin_key" ON "Scooter"("vin");

-- CreateIndex
CREATE INDEX "Scooter_deletedAt_idx" ON "Scooter"("deletedAt");

-- CreateIndex
CREATE INDEX "Scooter_powertrainType_deletedAt_idx" ON "Scooter"("powertrainType", "deletedAt");

-- CreateIndex
CREATE INDEX "Scooter_registrationStatus_deletedAt_idx" ON "Scooter"("registrationStatus", "deletedAt");

-- CreateIndex
CREATE INDEX "Scooter_brand_model_idx" ON "Scooter"("brand", "model");

-- CreateIndex
CREATE INDEX "Scooter_purchasedOn_idx" ON "Scooter"("purchasedOn");

-- CreateIndex
CREATE INDEX "Scooter_search_trgm_idx" ON "Scooter" USING gin (
  lower(
    coalesce("vin", '') || ' ' ||
    coalesce("brand", '') || ' ' ||
    coalesce("model", '') || ' ' ||
    coalesce("color", '') || ' ' ||
    coalesce("manufactureYear"::text, '') || ' ' ||
    coalesce("powertrainType", '') || ' ' ||
    coalesce("cylinderCapacityCc"::text, '') || ' ' ||
    coalesce("registrationStatus", '') || ' ' ||
    coalesce("notes", '')
  ) gin_trgm_ops
);
