ALTER TABLE "ScooterInsurancePolicy" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ScooterInsuranceRevision" ADD COLUMN "action" TEXT NOT NULL DEFAULT 'change';
