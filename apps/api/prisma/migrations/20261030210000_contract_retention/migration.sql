ALTER TABLE "MediaAsset"
  ADD COLUMN "contractCompanyId" TEXT,
  ADD COLUMN "contractPurpose" TEXT,
  ADD COLUMN "retentionPurgeItemId" TEXT,
  ADD COLUMN "retentionPurgedAt" TIMESTAMP(3);
ALTER TABLE "DocumentPackage"
  ADD COLUMN "retentionState" TEXT NOT NULL DEFAULT 'retained',
  ADD COLUMN "retentionPurgedCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "retentionRedactedAt" TIMESTAMP(3);
ALTER TABLE "AuditEvent"
  ADD COLUMN "retentionPurgedAt" TIMESTAMP(3),
  ADD COLUMN "retentionOriginalHash" TEXT;

CREATE TABLE "ContractRetentionPolicy" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL REFERENCES "FinanceLegalIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "category" TEXT NOT NULL CHECK ("category" IN ('contract','selfie','identity','audit','media')),
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "daysAfterRentalClosed" INTEGER NOT NULL CHECK ("daysAfterRentalClosed" > 0 AND "daysAfterRentalClosed" <= 36500),
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','approved')),
  "legalBasis" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approvalStatement" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (("status" = 'draft') OR ("approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedBy" <> "createdBy"))
);
CREATE UNIQUE INDEX "ContractRetentionPolicy_companyId_category_version_key" ON "ContractRetentionPolicy"("companyId","category","version");
CREATE INDEX "ContractRetentionPolicy_companyId_category_status_version_idx" ON "ContractRetentionPolicy"("companyId","category","status","version");

CREATE TABLE "ContractLegalHold" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL REFERENCES "FinanceLegalIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "packageId" TEXT,
  "assetId" TEXT,
  "category" TEXT CHECK ("category" IS NULL OR "category" IN ('contract','selfie','identity','audit','media')),
  "reason" TEXT NOT NULL,
  "legalBasis" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedBy" TEXT,
  "releasedAt" TIMESTAMP(3),
  "releaseReason" TEXT,
  CHECK (NOT ("packageId" IS NOT NULL AND "assetId" IS NOT NULL))
);
CREATE INDEX "ContractLegalHold_companyId_releasedAt_idx" ON "ContractLegalHold"("companyId","releasedAt");

CREATE TABLE "ContractRetentionBatch" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL REFERENCES "FinanceLegalIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "packageIds" TEXT[] NOT NULL,
  "categories" TEXT[] NOT NULL,
  "manifest" JSONB NOT NULL,
  "manifestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'preview' CHECK ("status" IN ('preview','approved','running','partial','completed')),
  "requestedBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approvalStatement" TEXT,
  "approvedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX "ContractRetentionBatch_companyId_createdAt_idx" ON "ContractRetentionBatch"("companyId","createdAt");

CREATE TABLE "ContractRetentionItem" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "ContractRetentionBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "category" TEXT NOT NULL CHECK ("category" IN ('contract','selfie','identity','audit','media')),
  "subjectType" TEXT NOT NULL CHECK ("subjectType" IN ('asset','package','audit')),
  "targetId" TEXT NOT NULL,
  "packageIds" TEXT[] NOT NULL,
  "policyId" TEXT NOT NULL,
  "expectedHash" TEXT NOT NULL,
  "eligibleAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','deleting','retry','purged','blocked')),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseUntil" TIMESTAMP(3),
  "error" TEXT,
  "purgedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "ContractRetentionItem_batchId_category_subjectType_targetId_key" ON "ContractRetentionItem"("batchId","category","subjectType","targetId");
CREATE INDEX "ContractRetentionItem_status_leaseUntil_idx" ON "ContractRetentionItem"("status","leaseUntil");
