ALTER TABLE "ScooterItpInspection" ALTER COLUMN "inspectionDate" DROP NOT NULL, ALTER COLUMN "cardDocumentId" DROP NOT NULL, ALTER COLUMN "certificateDocumentId" DROP NOT NULL;
ALTER TABLE "ScooterItpInspection" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'document', ADD COLUMN "effectiveDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "ScooterItpInspection" SET "effectiveDate" = "inspectionDate";
CREATE INDEX "ScooterItpInspection_scooterId_effectiveDate_createdAt_idx" ON "ScooterItpInspection"("scooterId", "effectiveDate", "createdAt");
CREATE TABLE "ScooterInsuranceRevision" ("id" TEXT NOT NULL, "policyId" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "source" TEXT NOT NULL DEFAULT 'unknown', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ScooterInsuranceRevision_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ScooterInsuranceRevision_policyId_createdAt_idx" ON "ScooterInsuranceRevision"("policyId", "createdAt");
ALTER TABLE "ScooterInsuranceRevision" ADD CONSTRAINT "ScooterInsuranceRevision_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "ScooterInsurancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
