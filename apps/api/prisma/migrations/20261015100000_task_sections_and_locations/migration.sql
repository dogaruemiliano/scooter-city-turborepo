ALTER TABLE "ScooterProblem"
  ADD COLUMN "sections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "buyList" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "location" JSONB;

UPDATE "ScooterProblem" SET "sections" = ARRAY['checklist']::TEXT[]
WHERE jsonb_array_length("checklist") > 0;

CREATE TABLE "BusinessLocation" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessLocation_name_address_key" ON "BusinessLocation"("name", "address");
