CREATE TYPE "ExpenseExtractionDraftStatus" AS ENUM (
  'ANALYZING',
  'READY',
  'FAILED',
  'CONFIRMED'
);

CREATE TABLE "FinanceLegalIdentity" (
  "id" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "normalizedLegalName" TEXT NOT NULL,
  "taxIdentifier" TEXT NOT NULL,
  "normalizedTaxIdentifier" TEXT NOT NULL,
  "nameAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "countryCode" TEXT NOT NULL DEFAULT 'RO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceLegalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseExtractionDraft" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "sourceUploadId" TEXT NOT NULL,
  "status" "ExpenseExtractionDraftStatus" NOT NULL DEFAULT 'ANALYZING',
  "provider" TEXT NOT NULL,
  "providerRequestId" TEXT,
  "parserVersion" TEXT NOT NULL,
  "result" JSONB,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "confirmedOperationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpenseExtractionDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceLegalIdentity_bookId_key"
  ON "FinanceLegalIdentity"("bookId");
CREATE UNIQUE INDEX "FinanceLegalIdentity_normalizedTaxIdentifier_key"
  ON "FinanceLegalIdentity"("normalizedTaxIdentifier");
CREATE UNIQUE INDEX "ExpenseExtractionDraft_sourceUploadId_key"
  ON "ExpenseExtractionDraft"("sourceUploadId");
CREATE UNIQUE INDEX "ExpenseExtractionDraft_confirmedOperationId_key"
  ON "ExpenseExtractionDraft"("confirmedOperationId");
CREATE INDEX "ExpenseExtractionDraft_ownerUserId_status_updatedAt_idx"
  ON "ExpenseExtractionDraft"("ownerUserId", "status", "updatedAt");
CREATE INDEX "ExpenseExtractionDraft_status_updatedAt_idx"
  ON "ExpenseExtractionDraft"("status", "updatedAt");

ALTER TABLE "FinanceLegalIdentity"
  ADD CONSTRAINT "FinanceLegalIdentity_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpenseExtractionDraft"
  ADD CONSTRAINT "ExpenseExtractionDraft_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseExtractionDraft"
  ADD CONSTRAINT "ExpenseExtractionDraft_sourceUploadId_fkey"
  FOREIGN KEY ("sourceUploadId") REFERENCES "DraftUpload"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseExtractionDraft"
  ADD CONSTRAINT "ExpenseExtractionDraft_confirmedOperationId_fkey"
  FOREIGN KEY ("confirmedOperationId") REFERENCES "FinancialOperation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
