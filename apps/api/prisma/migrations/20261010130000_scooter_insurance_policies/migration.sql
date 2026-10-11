-- AlterEnum
ALTER TYPE "ScooterDocumentType" ADD VALUE 'insurance';

-- AlterTable
ALTER TABLE "ScooterDocument" ADD COLUMN     "insurancePolicyId" TEXT;

-- CreateTable
CREATE TABLE "ScooterInsurancePolicy" (
    "id" TEXT NOT NULL,
    "scooterId" TEXT NOT NULL,
    "insuredName" TEXT,
    "validFrom" DATE,
    "validUntil" DATE,
    "premiumAmount" DECIMAL(12,2),
    "currency" VARCHAR(3),
    "documentVin" VARCHAR(17),
    "vinReviewConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "rawFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScooterInsurancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScooterInsurancePolicy_scooterId_validUntil_idx" ON "ScooterInsurancePolicy"("scooterId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ScooterInsurancePolicy_id_scooterId_key" ON "ScooterInsurancePolicy"("id", "scooterId");

-- AddForeignKey
ALTER TABLE "ScooterDocument" ADD CONSTRAINT "ScooterDocument_insurancePolicyId_scooterId_fkey" FOREIGN KEY ("insurancePolicyId", "scooterId") REFERENCES "ScooterInsurancePolicy"("id", "scooterId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScooterInsurancePolicy" ADD CONSTRAINT "ScooterInsurancePolicy_scooterId_fkey" FOREIGN KEY ("scooterId") REFERENCES "Scooter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve basic policy invariants even for writes outside the API.
ALTER TABLE "ScooterInsurancePolicy"
  ADD CONSTRAINT "ScooterInsurancePolicy_dates_check" CHECK ("validFrom" IS NULL OR "validUntil" IS NULL OR "validUntil" >= "validFrom"),
  ADD CONSTRAINT "ScooterInsurancePolicy_premium_check" CHECK ("premiumAmount" IS NULL OR "premiumAmount" >= 0);
