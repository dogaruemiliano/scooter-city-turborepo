ALTER TABLE "ScooterDocumentEditorSession"
  ADD COLUMN "isImportDraft" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "editorState" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "ScooterDocumentJob" ADD COLUMN "slotReservedAt" TIMESTAMP(3);

-- Reserve work admitted by the previous deployment, including its uncertain requests.
UPDATE "ScooterDocumentJob"
SET "slotReservedAt" = "createdAt"
WHERE "status" IN ('validating', 'submitting', 'running', 'submission_unknown')
   OR "validatedSource" IS NOT NULL
   OR "submissionUncertainAt" IS NOT NULL;

CREATE INDEX "ScooterDocumentEditorSession_userId_isImportDraft_status_ex_idx"
  ON "ScooterDocumentEditorSession" ("userId", "isImportDraft", "status", "expiresAt");
CREATE INDEX "ScooterDocumentJob_slotReservedAt_status_nextRunAt_idx"
  ON "ScooterDocumentJob" ("slotReservedAt", "status", "nextRunAt");

ALTER TYPE "ScooterDocumentType" ADD VALUE 'foreign_registration';
ALTER TYPE "ScooterDocumentType" ADD VALUE 'export_certificate';
ALTER TYPE "ScooterDocumentType" ADD VALUE 'itp_card';
ALTER TYPE "ScooterDocumentType" ADD VALUE 'itp_certificate';

CREATE TYPE "ScooterCivAvailability" AS ENUM ('unknown', 'not_issued', 'issued');
ALTER TABLE "Scooter" ADD COLUMN "civAvailability" "ScooterCivAvailability" NOT NULL DEFAULT 'unknown';
-- Existing CIV records/identifiers establish issuance; missing scans do not establish non-issuance.
UPDATE "Scooter" AS scooter SET "civAvailability" = 'issued'
WHERE NULLIF(BTRIM(scooter."civNumber"), '') IS NOT NULL
   OR EXISTS (SELECT 1 FROM "VehicleCivDocument" AS civ WHERE civ."scooterId" = scooter."id");

CREATE TABLE "ScooterItpInspection" (
  "id" TEXT NOT NULL,
  "scooterId" TEXT NOT NULL,
  "inspectionDate" DATE NOT NULL,
  "validUntil" DATE,
  "result" TEXT NOT NULL,
  "certificateNumber" TEXT,
  "odometerKm" INTEGER,
  "cardDocumentId" TEXT NOT NULL,
  "certificateDocumentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScooterItpInspection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScooterItpInspection_scooterId_inspectionDate_idx"
  ON "ScooterItpInspection" ("scooterId", "inspectionDate");
CREATE UNIQUE INDEX "ScooterItpInspection_scooterId_cardDocumentId_certificateDo_key"
  ON "ScooterItpInspection" ("scooterId", "cardDocumentId", "certificateDocumentId", "inspectionDate");
ALTER TABLE "ScooterItpInspection" ADD CONSTRAINT "ScooterItpInspection_scooterId_fkey"
  FOREIGN KEY ("scooterId") REFERENCES "Scooter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
