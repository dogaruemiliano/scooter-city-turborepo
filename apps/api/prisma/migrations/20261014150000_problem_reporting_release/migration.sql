-- Keep legacy priority separate from severity: repair priority cannot establish impact.
ALTER TABLE "ScooterProblem"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "severity" TEXT,
  ADD COLUMN "blocksUsage" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "holdClearedAt" TIMESTAMP(3),
  ADD COLUMN "holdClearedById" TEXT,
  ALTER COLUMN "description" SET DEFAULT '';
UPDATE "ScooterProblem" SET "title" = COALESCE(NULLIF(LEFT(BTRIM("description"), 160), ''), 'Scooter problem');
ALTER TABLE "ScooterProblem" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "ScooterProblem" ADD CONSTRAINT "ScooterProblem_severity_check"
  CHECK ("severity" IS NULL OR "severity" IN ('low', 'moderate', 'high', 'critical'));
CREATE INDEX "ScooterProblem_scooterId_blocksUsage_idx" ON "ScooterProblem"("scooterId", "blocksUsage");
CREATE INDEX "ScooterProblem_severity_status_idx" ON "ScooterProblem"("severity", "status");
CREATE TABLE "ScooterProblemPhoto" (
  "id" TEXT NOT NULL,
  "problemId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScooterProblemPhoto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScooterProblemPhoto_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "ScooterProblem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ScooterProblemPhoto_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ScooterProblemPhoto_assetId_key" ON "ScooterProblemPhoto"("assetId");
CREATE INDEX "ScooterProblemPhoto_problemId_createdAt_idx" ON "ScooterProblemPhoto"("problemId", "createdAt");
