-- First-class expense capture, allocation, tax snapshots and reimbursements.
-- OCR is intentionally absent; document metadata and assets are manual-only.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');
CREATE TYPE "ExpensePaymentSource" AS ENUM (
  'COMPANY_CARD',
  'COMPANY_CASH_DESK',
  'PERSONAL_FUNDS'
);
CREATE TYPE "ExpenseFundingTreatment" AS ENUM (
  'REIMBURSABLE',
  'NON_REIMBURSABLE'
);
CREATE TYPE "ExpenseAttributionTarget" AS ENUM ('BUSINESS', 'OWNER');
CREATE TYPE "ExpenseDocumentType" AS ENUM (
  'FISCAL_RECEIPT',
  'INVOICE',
  'POS_RECEIPT',
  'CREDIT_NOTE',
  'OTHER'
);
CREATE TYPE "ExpenseDocumentReviewStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'REJECTED'
);
CREATE TYPE "ExpenseBuyerCuiStatus" AS ENUM (
  'NOT_REVIEWED',
  'MATCHED',
  'MISSING',
  'MISMATCH',
  'NOT_APPLICABLE'
);
CREATE TYPE "ExpenseDocumentAssetRole" AS ENUM ('ORIGINAL', 'NORMALIZED');
CREATE TYPE "ExpensePostingRole" AS ENUM (
  'EXPENSE_PAYMENT',
  'EXPENSE_REVERSAL',
  'REIMBURSEMENT_SETTLEMENT'
);
CREATE TYPE "ExpenseReimbursementStatus" AS ENUM (
  'OPEN',
  'PARTIALLY_SETTLED',
  'SETTLED',
  'CANCELLED'
);

CREATE TABLE "BusinessLegalEntity" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'RON',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BusinessLegalEntity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessLegalEntity_currency_check"
    CHECK ("defaultCurrency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "BusinessLegalEntityWallet" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BusinessLegalEntityWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessOwner" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BusinessOwner_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessOwner_effective_range_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE TABLE "VatRegistrationPeriod" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "countryCode" CHAR(2) NOT NULL,
  "vatNumber" TEXT NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VatRegistrationPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VatRegistrationPeriod_country_check"
    CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  CONSTRAINT "VatRegistrationPeriod_effective_range_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "payeeId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
  "occurredOn" DATE NOT NULL,
  "taxPointOn" DATE NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'RON',
  "grossAmount" DECIMAL(19,2) NOT NULL,
  "recognizedCostAmount" DECIMAL(19,2) NOT NULL,
  "fiscalDeductibleAmount" DECIMAL(19,2) NOT NULL,
  "notes" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "postIdempotencyKey" TEXT,
  "reverseIdempotencyKey" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "postedByUserId" TEXT,
  "postedAt" TIMESTAMP(3),
  "reversedByUserId" TEXT,
  "reversedAt" TIMESTAMP(3),
  "reversalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Expense_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "Expense_amounts_check" CHECK (
    "grossAmount" > 0
    AND "recognizedCostAmount" >= 0
    AND "recognizedCostAmount" <= "grossAmount"
    AND "fiscalDeductibleAmount" >= 0
    AND "fiscalDeductibleAmount" <= "recognizedCostAmount"
  ),
  CONSTRAINT "Expense_status_audit_check" CHECK (
    (
      "status" = 'DRAFT'
      AND "postIdempotencyKey" IS NULL
      AND "postedByUserId" IS NULL
      AND "postedAt" IS NULL
      AND "reverseIdempotencyKey" IS NULL
      AND "reversedByUserId" IS NULL
      AND "reversedAt" IS NULL
    ) OR (
      "status" = 'POSTED'
      AND "postIdempotencyKey" IS NOT NULL
      AND "postedByUserId" IS NOT NULL
      AND "postedAt" IS NOT NULL
      AND "reverseIdempotencyKey" IS NULL
      AND "reversedByUserId" IS NULL
      AND "reversedAt" IS NULL
    ) OR (
      "status" = 'REVERSED'
      AND "postIdempotencyKey" IS NOT NULL
      AND "postedByUserId" IS NOT NULL
      AND "postedAt" IS NOT NULL
      AND "reverseIdempotencyKey" IS NOT NULL
      AND "reversedByUserId" IS NOT NULL
      AND "reversedAt" IS NOT NULL
    )
  )
);

CREATE TABLE "ExpensePayment" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "source" "ExpensePaymentSource" NOT NULL,
  "companyWalletId" TEXT,
  "fundedByUserId" TEXT,
  "paidByUserId" TEXT NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "paidOn" DATE NOT NULL,
  "fundingTreatment" "ExpenseFundingTreatment" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpensePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpensePayment_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "ExpensePayment_source_shape_check" CHECK (
    (
      "source" = 'PERSONAL_FUNDS'
      AND "companyWalletId" IS NULL
      AND "fundedByUserId" IS NOT NULL
    ) OR (
      "source" IN ('COMPANY_CARD', 'COMPANY_CASH_DESK')
      AND "companyWalletId" IS NOT NULL
      AND "fundedByUserId" IS NULL
      AND "fundingTreatment" = 'NON_REIMBURSABLE'
    )
  )
);

CREATE TABLE "ExpenseCostPool" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "grossAmount" DECIMAL(19,2) NOT NULL,
  "recognizedCostAmount" DECIMAL(19,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpenseCostPool_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseCostPool_amounts_check" CHECK (
    "grossAmount" > 0
    AND "recognizedCostAmount" >= 0
    AND "recognizedCostAmount" <= "grossAmount"
  )
);

CREATE TABLE "ExpenseCostAttribution" (
  "id" TEXT NOT NULL,
  "costPoolId" TEXT NOT NULL,
  "target" "ExpenseAttributionTarget" NOT NULL,
  "businessOwnerId" TEXT,
  "percentage" DECIMAL(7,4) NOT NULL DEFAULT 100,
  "allocatedGrossAmount" DECIMAL(19,2) NOT NULL,
  "allocatedRecognizedCostAmount" DECIMAL(19,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpenseCostAttribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseCostAttribution_target_check" CHECK (
    ("target" = 'BUSINESS' AND "businessOwnerId" IS NULL)
    OR ("target" = 'OWNER' AND "businessOwnerId" IS NOT NULL)
  ),
  CONSTRAINT "ExpenseCostAttribution_compact_share_check"
    CHECK ("percentage" = 100),
  CONSTRAINT "ExpenseCostAttribution_amounts_check" CHECK (
    "allocatedGrossAmount" > 0
    AND "allocatedRecognizedCostAmount" >= 0
    AND "allocatedRecognizedCostAmount" <= "allocatedGrossAmount"
  )
);

CREATE TABLE "ExpenseTaxSnapshot" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "vatRegistrationPeriodId" TEXT,
  "vatRegistrationCountryCode" CHAR(2),
  "vatRegistrationNumber" TEXT,
  "legalEntityTaxIdentifier" TEXT NOT NULL,
  "isVatRegistered" BOOLEAN NOT NULL,
  "taxPointOn" DATE NOT NULL,
  "grossAmount" DECIMAL(19,2) NOT NULL,
  "netAmount" DECIMAL(19,2) NOT NULL,
  "vatAmount" DECIMAL(19,2) NOT NULL,
  "recoverableVatAmount" DECIMAL(19,2) NOT NULL,
  "nonRecoverableVatAmount" DECIMAL(19,2) NOT NULL,
  "recognizedCostAmount" DECIMAL(19,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExpenseTaxSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseTaxSnapshot_registration_check" CHECK (
    (
      "isVatRegistered"
      AND "vatRegistrationPeriodId" IS NOT NULL
      AND "vatRegistrationCountryCode" IS NOT NULL
      AND "vatRegistrationNumber" IS NOT NULL
    ) OR (
      NOT "isVatRegistered"
      AND "vatRegistrationPeriodId" IS NULL
      AND "vatRegistrationCountryCode" IS NULL
      AND "vatRegistrationNumber" IS NULL
    )
  ),
  CONSTRAINT "ExpenseTaxSnapshot_legal_entity_tax_identifier_check"
    CHECK (length("legalEntityTaxIdentifier") > 0),
  CONSTRAINT "ExpenseTaxSnapshot_amounts_check" CHECK (
    "grossAmount" > 0
    AND "netAmount" >= 0
    AND "vatAmount" >= 0
    AND "netAmount" + "vatAmount" = "grossAmount"
    AND "recoverableVatAmount" >= 0
    AND "nonRecoverableVatAmount" >= 0
    AND "recoverableVatAmount" + "nonRecoverableVatAmount" = "vatAmount"
    AND "recognizedCostAmount" = "grossAmount" - "recoverableVatAmount"
    AND ("isVatRegistered" OR "recoverableVatAmount" = 0)
  )
);

CREATE TABLE "ExpenseTaxLine" (
  "id" TEXT NOT NULL,
  "taxSnapshotId" TEXT NOT NULL,
  "vatRate" DECIMAL(7,4) NOT NULL,
  "netAmount" DECIMAL(19,2) NOT NULL,
  "vatAmount" DECIMAL(19,2) NOT NULL,
  "grossAmount" DECIMAL(19,2) NOT NULL,
  "deductiblePercent" DECIMAL(7,4) NOT NULL,
  "recoverableVatAmount" DECIMAL(19,2) NOT NULL,
  "nonRecoverableVatAmount" DECIMAL(19,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExpenseTaxLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseTaxLine_rate_check"
    CHECK ("vatRate" >= 0 AND "vatRate" <= 100),
  CONSTRAINT "ExpenseTaxLine_deductibility_check"
    CHECK ("deductiblePercent" >= 0 AND "deductiblePercent" <= 100),
  CONSTRAINT "ExpenseTaxLine_amounts_check" CHECK (
    "netAmount" >= 0
    AND "vatAmount" >= 0
    AND "grossAmount" > 0
    AND "netAmount" + "vatAmount" = "grossAmount"
    AND "recoverableVatAmount" >= 0
    AND "nonRecoverableVatAmount" >= 0
    AND "recoverableVatAmount" + "nonRecoverableVatAmount" = "vatAmount"
    AND round("netAmount" * "vatRate" / 100, 2) = "vatAmount"
  )
);

CREATE TABLE "ExpenseReference" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExpenseReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseDocument" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "type" "ExpenseDocumentType" NOT NULL,
  "documentSeries" TEXT,
  "documentNumber" TEXT,
  "supplierName" TEXT,
  "supplierTaxIdentifier" TEXT,
  "buyerTaxIdentifier" TEXT,
  "issuedOn" DATE,
  "buyerCuiStatus" "ExpenseBuyerCuiStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
  "reviewStatus" "ExpenseDocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpenseDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseDocument_review_check" CHECK (
    ("reviewStatus" = 'PENDING' AND "reviewedByUserId" IS NULL AND "reviewedAt" IS NULL)
    OR ("reviewStatus" <> 'PENDING' AND "reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL)
  )
);

CREATE TABLE "ExpenseDocumentAsset" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "role" "ExpenseDocumentAssetRole" NOT NULL,
  "imageWidth" INTEGER,
  "imageHeight" INTEGER,
  "pageCount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExpenseDocumentAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseDocumentAsset_metadata_check" CHECK (
    (
      "imageWidth" > 0
      AND "imageHeight" > 0
      AND "pageCount" IS NULL
    ) OR (
      "imageWidth" IS NULL
      AND "imageHeight" IS NULL
      AND "pageCount" > 0
    )
  )
);

CREATE TABLE "ExpenseReimbursementClaim" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "expensePaymentId" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "claimantUserId" TEXT NOT NULL,
  "status" "ExpenseReimbursementStatus" NOT NULL DEFAULT 'OPEN',
  "originalAmount" DECIMAL(19,2) NOT NULL,
  "settledAmount" DECIMAL(19,2) NOT NULL DEFAULT 0,
  "currency" CHAR(3) NOT NULL DEFAULT 'RON',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpenseReimbursementClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseReimbursementClaim_currency_check"
    CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "ExpenseReimbursementClaim_amounts_check" CHECK (
    "originalAmount" > 0
    AND "settledAmount" >= 0
    AND "settledAmount" <= "originalAmount"
  ),
  CONSTRAINT "ExpenseReimbursementClaim_status_check" CHECK (
    ("status" = 'OPEN' AND "settledAmount" = 0)
    OR (
      "status" = 'PARTIALLY_SETTLED'
      AND "settledAmount" > 0
      AND "settledAmount" < "originalAmount"
    )
    OR ("status" = 'SETTLED' AND "settledAmount" = "originalAmount")
    OR "status" = 'CANCELLED'
  )
);

CREATE TABLE "ExpenseReimbursementSettlement" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "companyWalletId" TEXT NOT NULL,
  "paidOn" DATE NOT NULL,
  "paidByUserId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExpenseReimbursementSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseReimbursementSettlement_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "ExpensePosting" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "paymentId" TEXT,
  "reimbursementSettlementId" TEXT,
  "role" "ExpensePostingRole" NOT NULL,
  "moneyTransactionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExpensePosting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpensePosting_role_check" CHECK (
    (
      "role" = 'EXPENSE_PAYMENT'
      AND "paymentId" IS NOT NULL
      AND "reimbursementSettlementId" IS NULL
    ) OR (
      "role" = 'EXPENSE_REVERSAL'
      AND "paymentId" IS NULL
      AND "reimbursementSettlementId" IS NULL
    ) OR (
      "role" = 'REIMBURSEMENT_SETTLEMENT'
      AND "paymentId" IS NULL
      AND "reimbursementSettlementId" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "BusinessLegalEntity_companyId_key"
  ON "BusinessLegalEntity"("companyId");
CREATE INDEX "BusinessLegalEntity_isActive_idx"
  ON "BusinessLegalEntity"("isActive");

CREATE UNIQUE INDEX "BusinessLegalEntityWallet_walletId_key"
  ON "BusinessLegalEntityWallet"("walletId");
CREATE INDEX "BusinessLegalEntityWallet_legalEntityId_idx"
  ON "BusinessLegalEntityWallet"("legalEntityId");
CREATE UNIQUE INDEX "BusinessLegalEntityWallet_legalEntityId_walletId_key"
  ON "BusinessLegalEntityWallet"("legalEntityId", "walletId");

CREATE INDEX "BusinessOwner_legalEntityId_effectiveFrom_effectiveTo_idx"
  ON "BusinessOwner"("legalEntityId", "effectiveFrom", "effectiveTo");
CREATE INDEX "BusinessOwner_userId_effectiveFrom_effectiveTo_idx"
  ON "BusinessOwner"("userId", "effectiveFrom", "effectiveTo");
CREATE UNIQUE INDEX "BusinessOwner_legalEntityId_userId_effectiveFrom_key"
  ON "BusinessOwner"("legalEntityId", "userId", "effectiveFrom");
ALTER TABLE "BusinessOwner" ADD CONSTRAINT "BusinessOwner_no_overlapping_periods"
  EXCLUDE USING gist (
    "legalEntityId" WITH =,
    "userId" WITH =,
    daterange("effectiveFrom", "effectiveTo", '[)') WITH &&
  );

CREATE INDEX "VatRegistrationPeriod_legalEntityId_effectiveFrom_effective_idx"
  ON "VatRegistrationPeriod"("legalEntityId", "effectiveFrom", "effectiveTo");
CREATE UNIQUE INDEX "VatRegistrationPeriod_legalEntityId_countryCode_vatNumber_e_key"
  ON "VatRegistrationPeriod"("legalEntityId", "countryCode", "vatNumber", "effectiveFrom");
ALTER TABLE "VatRegistrationPeriod" ADD CONSTRAINT "VatRegistrationPeriod_no_overlapping_periods"
  EXCLUDE USING gist (
    "legalEntityId" WITH =,
    daterange("effectiveFrom", "effectiveTo", '[)') WITH &&
  );

CREATE UNIQUE INDEX "Expense_idempotencyKey_key" ON "Expense"("idempotencyKey");
CREATE UNIQUE INDEX "Expense_postIdempotencyKey_key" ON "Expense"("postIdempotencyKey");
CREATE UNIQUE INDEX "Expense_reverseIdempotencyKey_key" ON "Expense"("reverseIdempotencyKey");
CREATE INDEX "Expense_legalEntityId_status_occurredOn_idx"
  ON "Expense"("legalEntityId", "status", "occurredOn");
CREATE INDEX "Expense_payeeId_occurredOn_idx" ON "Expense"("payeeId", "occurredOn");
CREATE INDEX "Expense_categoryId_occurredOn_idx" ON "Expense"("categoryId", "occurredOn");
CREATE INDEX "Expense_status_taxPointOn_idx" ON "Expense"("status", "taxPointOn");

CREATE UNIQUE INDEX "ExpensePayment_expenseId_key" ON "ExpensePayment"("expenseId");
CREATE INDEX "ExpensePayment_source_paidOn_idx" ON "ExpensePayment"("source", "paidOn");
CREATE INDEX "ExpensePayment_companyWalletId_paidOn_idx"
  ON "ExpensePayment"("companyWalletId", "paidOn");
CREATE INDEX "ExpensePayment_fundedByUserId_paidOn_idx"
  ON "ExpensePayment"("fundedByUserId", "paidOn");
CREATE INDEX "ExpensePayment_paidByUserId_paidOn_idx"
  ON "ExpensePayment"("paidByUserId", "paidOn");

CREATE UNIQUE INDEX "ExpenseCostPool_expenseId_key" ON "ExpenseCostPool"("expenseId");
CREATE UNIQUE INDEX "ExpenseCostAttribution_costPoolId_key"
  ON "ExpenseCostAttribution"("costPoolId");
CREATE INDEX "ExpenseCostAttribution_target_businessOwnerId_idx"
  ON "ExpenseCostAttribution"("target", "businessOwnerId");

CREATE UNIQUE INDEX "ExpenseTaxSnapshot_expenseId_key"
  ON "ExpenseTaxSnapshot"("expenseId");
CREATE INDEX "ExpenseTaxSnapshot_vatRegistrationPeriodId_idx"
  ON "ExpenseTaxSnapshot"("vatRegistrationPeriodId");
CREATE INDEX "ExpenseTaxSnapshot_taxPointOn_isVatRegistered_idx"
  ON "ExpenseTaxSnapshot"("taxPointOn", "isVatRegistered");
CREATE INDEX "ExpenseTaxLine_taxSnapshotId_idx" ON "ExpenseTaxLine"("taxSnapshotId");

CREATE INDEX "ExpenseReference_referenceType_referenceId_idx"
  ON "ExpenseReference"("referenceType", "referenceId");
CREATE INDEX "ExpenseReference_expenseId_isPrimary_idx"
  ON "ExpenseReference"("expenseId", "isPrimary");
CREATE UNIQUE INDEX "ExpenseReference_expenseId_referenceType_referenceId_key"
  ON "ExpenseReference"("expenseId", "referenceType", "referenceId");

CREATE INDEX "ExpenseDocument_expenseId_type_idx" ON "ExpenseDocument"("expenseId", "type");
CREATE INDEX "ExpenseDocument_reviewStatus_buyerCuiStatus_idx"
  ON "ExpenseDocument"("reviewStatus", "buyerCuiStatus");
CREATE INDEX "ExpenseDocument_reviewedByUserId_idx"
  ON "ExpenseDocument"("reviewedByUserId");
CREATE UNIQUE INDEX "ExpenseDocumentAsset_assetId_key"
  ON "ExpenseDocumentAsset"("assetId");
CREATE INDEX "ExpenseDocumentAsset_documentId_idx"
  ON "ExpenseDocumentAsset"("documentId");
CREATE UNIQUE INDEX "ExpenseDocumentAsset_documentId_role_key"
  ON "ExpenseDocumentAsset"("documentId", "role");

CREATE UNIQUE INDEX "ExpenseReimbursementClaim_expenseId_key"
  ON "ExpenseReimbursementClaim"("expenseId");
CREATE UNIQUE INDEX "ExpenseReimbursementClaim_expensePaymentId_key"
  ON "ExpenseReimbursementClaim"("expensePaymentId");
CREATE INDEX "ExpenseReimbursementClaim_legalEntityId_status_createdAt_idx"
  ON "ExpenseReimbursementClaim"("legalEntityId", "status", "createdAt");
CREATE INDEX "ExpenseReimbursementClaim_claimantUserId_status_idx"
  ON "ExpenseReimbursementClaim"("claimantUserId", "status");

CREATE UNIQUE INDEX "ExpenseReimbursementSettlement_idempotencyKey_key"
  ON "ExpenseReimbursementSettlement"("idempotencyKey");
CREATE INDEX "ExpenseReimbursementSettlement_claimId_paidOn_idx"
  ON "ExpenseReimbursementSettlement"("claimId", "paidOn");
CREATE INDEX "ExpenseReimbursementSettlement_companyWalletId_paidOn_idx"
  ON "ExpenseReimbursementSettlement"("companyWalletId", "paidOn");

CREATE UNIQUE INDEX "ExpensePosting_paymentId_key" ON "ExpensePosting"("paymentId");
CREATE UNIQUE INDEX "ExpensePosting_reimbursementSettlementId_key"
  ON "ExpensePosting"("reimbursementSettlementId");
CREATE UNIQUE INDEX "ExpensePosting_moneyTransactionId_key"
  ON "ExpensePosting"("moneyTransactionId");
CREATE INDEX "ExpensePosting_expenseId_role_idx" ON "ExpensePosting"("expenseId", "role");

ALTER TABLE "BusinessLegalEntity" ADD CONSTRAINT "BusinessLegalEntity_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessLegalEntityWallet" ADD CONSTRAINT "BusinessLegalEntityWallet_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "BusinessLegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessLegalEntityWallet" ADD CONSTRAINT "BusinessLegalEntityWallet_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessOwner" ADD CONSTRAINT "BusinessOwner_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "BusinessLegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessOwner" ADD CONSTRAINT "BusinessOwner_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VatRegistrationPeriod" ADD CONSTRAINT "VatRegistrationPeriod_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "BusinessLegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "BusinessLegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_payeeId_fkey"
  FOREIGN KEY ("payeeId") REFERENCES "Counterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_postedByUserId_fkey"
  FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reversedByUserId_fkey"
  FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_companyWalletId_fkey"
  FOREIGN KEY ("companyWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_fundedByUserId_fkey"
  FOREIGN KEY ("fundedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_paidByUserId_fkey"
  FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpenseCostPool" ADD CONSTRAINT "ExpenseCostPool_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseCostAttribution" ADD CONSTRAINT "ExpenseCostAttribution_costPoolId_fkey"
  FOREIGN KEY ("costPoolId") REFERENCES "ExpenseCostPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseCostAttribution" ADD CONSTRAINT "ExpenseCostAttribution_businessOwnerId_fkey"
  FOREIGN KEY ("businessOwnerId") REFERENCES "BusinessOwner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpenseTaxSnapshot" ADD CONSTRAINT "ExpenseTaxSnapshot_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseTaxSnapshot" ADD CONSTRAINT "ExpenseTaxSnapshot_vatRegistrationPeriodId_fkey"
  FOREIGN KEY ("vatRegistrationPeriodId") REFERENCES "VatRegistrationPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseTaxLine" ADD CONSTRAINT "ExpenseTaxLine_taxSnapshotId_fkey"
  FOREIGN KEY ("taxSnapshotId") REFERENCES "ExpenseTaxSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseReference" ADD CONSTRAINT "ExpenseReference_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpenseDocument" ADD CONSTRAINT "ExpenseDocument_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseDocument" ADD CONSTRAINT "ExpenseDocument_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseDocumentAsset" ADD CONSTRAINT "ExpenseDocumentAsset_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "ExpenseDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseDocumentAsset" ADD CONSTRAINT "ExpenseDocumentAsset_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpenseReimbursementClaim" ADD CONSTRAINT "ExpenseReimbursementClaim_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseReimbursementClaim" ADD CONSTRAINT "ExpenseReimbursementClaim_expensePaymentId_fkey"
  FOREIGN KEY ("expensePaymentId") REFERENCES "ExpensePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseReimbursementClaim" ADD CONSTRAINT "ExpenseReimbursementClaim_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "BusinessLegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseReimbursementClaim" ADD CONSTRAINT "ExpenseReimbursementClaim_claimantUserId_fkey"
  FOREIGN KEY ("claimantUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseReimbursementSettlement" ADD CONSTRAINT "ExpenseReimbursementSettlement_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "ExpenseReimbursementClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseReimbursementSettlement" ADD CONSTRAINT "ExpenseReimbursementSettlement_companyWalletId_fkey"
  FOREIGN KEY ("companyWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseReimbursementSettlement" ADD CONSTRAINT "ExpenseReimbursementSettlement_paidByUserId_fkey"
  FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpensePosting" ADD CONSTRAINT "ExpensePosting_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpensePosting" ADD CONSTRAINT "ExpensePosting_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "ExpensePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpensePosting" ADD CONSTRAINT "ExpensePosting_reimbursementSettlementId_fkey"
  FOREIGN KEY ("reimbursementSettlementId") REFERENCES "ExpenseReimbursementSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpensePosting" ADD CONSTRAINT "ExpensePosting_moneyTransactionId_fkey"
  FOREIGN KEY ("moneyTransactionId") REFERENCES "MoneyTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A Romanian CUI may be captured with or without the conventional RO prefix.
-- Remove that prefix only when it is followed entirely by digits; other
-- country prefixes remain part of the identifier.
CREATE FUNCTION normalize_ro_tax_identifier(input_value TEXT) RETURNS TEXT AS $$
  SELECT CASE
    WHEN normalized = '' THEN NULL
    WHEN normalized ~ '^RO[0-9]+$' THEN substring(normalized FROM 3)
    ELSE normalized
  END
  FROM (
    SELECT regexp_replace(upper(COALESCE(input_value, '')), '[^A-Z0-9]', '', 'g') AS normalized
  ) AS canonical;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

DO $$
DECLARE
  conflicting_identifier TEXT;
  conflicting_company_ids TEXT;
BEGIN
  SELECT
    normalize_ro_tax_identifier(company."taxIdentifier"),
    string_agg(company."id", ', ' ORDER BY company."id")
  INTO conflicting_identifier, conflicting_company_ids
  FROM "Company" AS company
  WHERE normalize_ro_tax_identifier(company."taxIdentifier") IS NOT NULL
  GROUP BY normalize_ro_tax_identifier(company."taxIdentifier")
  HAVING count(*) > 1
  LIMIT 1;

  IF conflicting_identifier IS NOT NULL THEN
    RAISE EXCEPTION
      'cannot canonicalize duplicate company tax identifier % for company IDs %',
      conflicting_identifier,
      conflicting_company_ids
      USING ERRCODE = '23505',
        HINT = 'Merge or correct the conflicting Company rows before applying this migration.';
  END IF;
END;
$$;

-- Clear first so stale legacy normalized values cannot collide with another
-- row's new canonical value during the rewrite. The duplicate preflight above
-- guarantees that the final non-null values remain unique.
UPDATE "Company"
SET "taxIdentifierNormalized" = NULL
WHERE "taxIdentifierNormalized" IS NOT NULL;
UPDATE "Company"
SET "taxIdentifierNormalized" = normalize_ro_tax_identifier("taxIdentifier")
WHERE normalize_ro_tax_identifier("taxIdentifier") IS NOT NULL;

CREATE FUNCTION synchronize_company_tax_identifier() RETURNS trigger AS $$
BEGIN
  NEW."taxIdentifierNormalized" := normalize_ro_tax_identifier(NEW."taxIdentifier");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Company_canonical_tax_identifier_trigger"
  BEFORE INSERT OR UPDATE OF "taxIdentifier", "taxIdentifierNormalized" ON "Company"
  FOR EACH ROW EXECUTE FUNCTION synchronize_company_tax_identifier();

CREATE FUNCTION validate_business_legal_entity_tax_identifier() RETURNS trigger AS $$
DECLARE
  canonical_tax_identifier TEXT;
BEGIN
  IF TG_TABLE_NAME = 'BusinessLegalEntity' THEN
    SELECT normalize_ro_tax_identifier(company."taxIdentifier")
    INTO canonical_tax_identifier
    FROM "Company" AS company
    WHERE company."id" = NEW."companyId";

    IF canonical_tax_identifier IS NULL THEN
      RAISE EXCEPTION 'a business legal entity company requires a tax identifier'
        USING ERRCODE = '23514';
    END IF;
  ELSIF EXISTS (
    SELECT 1
    FROM "BusinessLegalEntity" AS entity
    WHERE entity."companyId" = NEW."id"
  ) AND normalize_ro_tax_identifier(NEW."taxIdentifier")
    IS DISTINCT FROM normalize_ro_tax_identifier(OLD."taxIdentifier")
  THEN
    RAISE EXCEPTION 'a business legal entity tax identity cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BusinessLegalEntity_tax_identifier_trigger"
  BEFORE INSERT OR UPDATE OF "companyId" ON "BusinessLegalEntity"
  FOR EACH ROW EXECUTE FUNCTION validate_business_legal_entity_tax_identifier();
CREATE TRIGGER "Company_business_legal_entity_tax_identifier_trigger"
  BEFORE UPDATE OF "taxIdentifier" ON "Company"
  FOR EACH ROW EXECUTE FUNCTION validate_business_legal_entity_tax_identifier();

CREATE FUNCTION protect_posted_expense_vat_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1
    FROM "Expense" AS expense
    WHERE expense."legalEntityId" = NEW."legalEntityId"
      AND expense."status" IN ('POSTED', 'REVERSED')
      AND expense."taxPointOn" >= NEW."effectiveFrom"
      AND (NEW."effectiveTo" IS NULL OR expense."taxPointOn" < NEW."effectiveTo")
  ) THEN
    RAISE EXCEPTION 'a VAT period cannot change historical posted expense facts'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    EXISTS (
      SELECT 1
      FROM "ExpenseTaxSnapshot" AS snapshot
      JOIN "Expense" AS expense ON expense."id" = snapshot."expenseId"
      WHERE snapshot."vatRegistrationPeriodId" = OLD."id"
        AND expense."status" IN ('POSTED', 'REVERSED')
        AND (
          NEW."legalEntityId" <> OLD."legalEntityId"
          OR snapshot."taxPointOn" < NEW."effectiveFrom"
          OR (NEW."effectiveTo" IS NOT NULL AND snapshot."taxPointOn" >= NEW."effectiveTo")
          OR snapshot."vatRegistrationCountryCode" IS DISTINCT FROM NEW."countryCode"
          OR snapshot."vatRegistrationNumber" IS DISTINCT FROM NEW."vatNumber"
        )
    )
    OR EXISTS (
      SELECT 1
      FROM "Expense" AS expense
      JOIN "ExpenseTaxSnapshot" AS snapshot ON snapshot."expenseId" = expense."id"
      WHERE expense."legalEntityId" = NEW."legalEntityId"
        AND expense."status" IN ('POSTED', 'REVERSED')
        AND expense."taxPointOn" >= NEW."effectiveFrom"
        AND (NEW."effectiveTo" IS NULL OR expense."taxPointOn" < NEW."effectiveTo")
        AND snapshot."vatRegistrationPeriodId" IS DISTINCT FROM NEW."id"
    )
  ) THEN
    RAISE EXCEPTION 'a VAT period cannot invalidate a posted tax snapshot'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "VatRegistrationPeriod_posted_history_trigger"
  BEFORE INSERT OR UPDATE ON "VatRegistrationPeriod"
  FOR EACH ROW EXECUTE FUNCTION protect_posted_expense_vat_history();

CREATE FUNCTION protect_locked_expense_evidence_and_tax() RETURNS trigger AS $$
DECLARE
  expense_id TEXT;
  expense_status "ExpenseStatus";
BEGIN
  IF TG_TABLE_NAME = 'ExpenseDocument' THEN
    IF TG_OP = 'UPDATE' AND OLD."expenseId" IS DISTINCT FROM NEW."expenseId" THEN
      RAISE EXCEPTION 'expense documents cannot be reparented'
        USING ERRCODE = '23514';
    END IF;
    expense_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."expenseId" ELSE NEW."expenseId" END;
  ELSIF TG_TABLE_NAME = 'ExpenseTaxSnapshot' THEN
    IF TG_OP = 'UPDATE' AND OLD."expenseId" IS DISTINCT FROM NEW."expenseId" THEN
      RAISE EXCEPTION 'expense tax snapshots cannot be reparented'
        USING ERRCODE = '23514';
    END IF;
    expense_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."expenseId" ELSE NEW."expenseId" END;
  ELSIF TG_TABLE_NAME = 'ExpenseTaxLine' THEN
    IF TG_OP = 'UPDATE' AND OLD."taxSnapshotId" IS DISTINCT FROM NEW."taxSnapshotId" THEN
      RAISE EXCEPTION 'expense tax lines cannot be reparented'
        USING ERRCODE = '23514';
    END IF;
    SELECT snapshot."expenseId" INTO expense_id
    FROM "ExpenseTaxSnapshot" AS snapshot
    WHERE snapshot."id" = CASE
      WHEN TG_OP = 'DELETE' THEN OLD."taxSnapshotId"
      ELSE NEW."taxSnapshotId"
    END;
  END IF;

  SELECT expense."status" INTO expense_status
  FROM "Expense" AS expense
  WHERE expense."id" = expense_id
  FOR SHARE OF expense;

  IF expense_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'posted or reversed expense evidence and tax facts are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ExpenseDocument_locked_metadata_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseDocument"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_expense_evidence_and_tax();
CREATE TRIGGER "ExpenseTaxSnapshot_locked_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseTaxSnapshot"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_expense_evidence_and_tax();
CREATE TRIGGER "ExpenseTaxLine_locked_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseTaxLine"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_expense_evidence_and_tax();

CREATE FUNCTION protect_expense_document_asset_mutability() RETURNS trigger AS $$
DECLARE
  document_id TEXT;
  expense_status "ExpenseStatus";
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'expense document asset links are immutable'
      USING ERRCODE = '23514';
  END IF;

  document_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."documentId" ELSE NEW."documentId" END;
  SELECT expense."status" INTO expense_status
  FROM "ExpenseDocument" AS document
  JOIN "Expense" AS expense ON expense."id" = document."expenseId"
  WHERE document."id" = document_id
  FOR SHARE OF expense;

  -- A cascading draft-document delete may make the parent invisible to this
  -- child trigger. The parent document's own BEFORE trigger already enforced
  -- draft-only deletion.
  IF NOT FOUND AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'expense document asset links are append-only; delete the draft document instead'
      USING ERRCODE = '23514';
  END IF;
  IF expense_status = 'REVERSED'
  THEN
    RAISE EXCEPTION 'expense document files are locked for this lifecycle state'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM 1
    FROM "MediaAsset" AS asset
    WHERE asset."id" = NEW."assetId"
    FOR SHARE OF asset;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'expense document media asset does not exist'
        USING ERRCODE = '23503';
    END IF;
  END IF;
  IF TG_OP = 'INSERT'
    AND NEW."role" = 'NORMALIZED'
    AND NOT EXISTS (
      SELECT 1
      FROM "ExpenseDocumentAsset" AS original
      WHERE original."documentId" = NEW."documentId"
        AND original."role" = 'ORIGINAL'
    )
  THEN
    RAISE EXCEPTION 'a normalized expense document requires an original file first'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ExpenseDocumentAsset_locked_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseDocumentAsset"
  FOR EACH ROW EXECUTE FUNCTION protect_expense_document_asset_mutability();

CREATE FUNCTION protect_linked_expense_media_asset() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ExpenseDocumentAsset" AS link
    WHERE link."assetId" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'media assets linked to expense evidence are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MediaAsset_expense_evidence_immutability_trigger"
  BEFORE UPDATE OR DELETE ON "MediaAsset"
  FOR EACH ROW EXECUTE FUNCTION protect_linked_expense_media_asset();

CREATE FUNCTION protect_expense_relationship_identity() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'ExpensePayment' THEN
    IF OLD."expenseId" IS DISTINCT FROM NEW."expenseId" THEN
      RAISE EXCEPTION 'expense payments cannot be reparented'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'ExpenseCostPool' THEN
    IF OLD."expenseId" IS DISTINCT FROM NEW."expenseId" THEN
      RAISE EXCEPTION 'expense cost pools cannot be reparented'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'ExpenseCostAttribution' THEN
    IF OLD."costPoolId" IS DISTINCT FROM NEW."costPoolId" THEN
      RAISE EXCEPTION 'expense cost attributions cannot be reparented'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'ExpenseReference' THEN
    IF OLD."expenseId" IS DISTINCT FROM NEW."expenseId" THEN
      RAISE EXCEPTION 'expense references cannot be reparented'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'ExpenseReimbursementClaim' THEN
    IF ROW(
        OLD."expenseId",
        OLD."expensePaymentId",
        OLD."legalEntityId",
        OLD."claimantUserId"
      ) IS DISTINCT FROM ROW(
        NEW."expenseId",
        NEW."expensePaymentId",
        NEW."legalEntityId",
        NEW."claimantUserId"
      )
    THEN
      RAISE EXCEPTION 'expense reimbursement claims cannot be reparented'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'ExpenseReimbursementSettlement' THEN
    IF OLD."claimId" IS DISTINCT FROM NEW."claimId" THEN
      RAISE EXCEPTION 'expense reimbursement settlements cannot be reparented'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'ExpensePosting' THEN
    RAISE EXCEPTION 'expense postings are append-only'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ExpensePayment_relationship_identity_trigger"
  BEFORE UPDATE ON "ExpensePayment"
  FOR EACH ROW EXECUTE FUNCTION protect_expense_relationship_identity();
CREATE TRIGGER "ExpenseCostPool_relationship_identity_trigger"
  BEFORE UPDATE ON "ExpenseCostPool"
  FOR EACH ROW EXECUTE FUNCTION protect_expense_relationship_identity();
CREATE TRIGGER "ExpenseCostAttribution_relationship_identity_trigger"
  BEFORE UPDATE ON "ExpenseCostAttribution"
  FOR EACH ROW EXECUTE FUNCTION protect_expense_relationship_identity();
CREATE TRIGGER "ExpenseReference_relationship_identity_trigger"
  BEFORE UPDATE ON "ExpenseReference"
  FOR EACH ROW EXECUTE FUNCTION protect_expense_relationship_identity();
CREATE TRIGGER "ExpenseReimbursementClaim_relationship_identity_trigger"
  BEFORE UPDATE ON "ExpenseReimbursementClaim"
  FOR EACH ROW EXECUTE FUNCTION protect_expense_relationship_identity();
CREATE TRIGGER "ExpenseReimbursementSettlement_relationship_identity_trigger"
  BEFORE UPDATE ON "ExpenseReimbursementSettlement"
  FOR EACH ROW EXECUTE FUNCTION protect_expense_relationship_identity();
CREATE TRIGGER "ExpensePosting_relationship_identity_trigger"
  BEFORE UPDATE OR DELETE ON "ExpensePosting"
  FOR EACH ROW EXECUTE FUNCTION protect_expense_relationship_identity();

-- Expense ledger children are created before their ExpensePosting. Once the
-- posting exists, the relationship is append-only and every balance/reference
-- fact is immutable. Checking both parents on UPDATE prevents reparenting a
-- linked child to an unrelated transaction to evade deferred validation.
CREATE FUNCTION protect_expense_linked_wallet_balance_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD."moneyTransactionId" IS DISTINCT FROM NEW."moneyTransactionId"
  THEN
    RAISE EXCEPTION 'wallet balance changes cannot be reparented'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM 1
    FROM "ExpensePosting" AS posting
    WHERE posting."moneyTransactionId" = OLD."moneyTransactionId"
    FOR SHARE OF posting;

    IF FOUND THEN
      RAISE EXCEPTION 'expense-linked wallet balance changes are immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  PERFORM 1
  FROM "ExpensePosting" AS posting
  WHERE posting."moneyTransactionId" = NEW."moneyTransactionId"
  FOR SHARE OF posting;

  IF FOUND THEN
    RAISE EXCEPTION 'expense-linked wallet balance changes are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WalletBalanceChange_expense_immutability_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "WalletBalanceChange"
  FOR EACH ROW EXECUTE FUNCTION protect_expense_linked_wallet_balance_change();

CREATE FUNCTION protect_expense_linked_transaction_reference() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM 1
    FROM "ExpensePosting" AS posting
    WHERE posting."moneyTransactionId" = OLD."moneyTransactionId"
    FOR SHARE OF posting;

    IF FOUND THEN
      RAISE EXCEPTION 'expense-linked transaction references are immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    PERFORM 1
    FROM "ExpensePosting" AS posting
    WHERE posting."moneyTransactionId" IN (
      OLD."moneyTransactionId",
      NEW."moneyTransactionId"
    )
    FOR SHARE OF posting;
  ELSE
    PERFORM 1
    FROM "ExpensePosting" AS posting
    WHERE posting."moneyTransactionId" = NEW."moneyTransactionId"
    FOR SHARE OF posting;
  END IF;

  IF FOUND THEN
    RAISE EXCEPTION 'expense-linked transaction references are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MoneyTransactionReference_expense_immutability_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "MoneyTransactionReference"
  FOR EACH ROW EXECUTE FUNCTION protect_expense_linked_transaction_reference();

CREATE FUNCTION protect_expense_linked_money_transaction() RETURNS trigger AS $$
DECLARE
  posting_role "ExpensePostingRole";
BEGIN
  SELECT posting."role" INTO posting_role
  FROM "ExpensePosting" AS posting
  WHERE posting."moneyTransactionId" = OLD."id"
  FOR SHARE OF posting;

  IF NOT FOUND AND TG_OP = 'UPDATE' THEN
    SELECT posting."role" INTO posting_role
    FROM "ExpensePosting" AS posting
    WHERE posting."moneyTransactionId" = NEW."id"
    FOR SHARE OF posting;
  END IF;

  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND posting_role = 'EXPENSE_PAYMENT'
    AND OLD."status" = 'POSTED'
    AND NEW."status" = 'REVERSED'
    AND ROW(
      OLD."id",
      OLD."type",
      OLD."amount",
      OLD."currency",
      OLD."financialScope",
      OLD."paymentMethod",
      OLD."billingStatus",
      OLD."categoryId",
      OLD."counterpartyUserId",
      OLD."counterpartyId",
      OLD."recipientUserId",
      OLD."recipientCounterpartyId",
      OLD."debtorUserId",
      OLD."debtorCounterpartyId",
      OLD."creditorUserId",
      OLD."creditorCounterpartyId",
      OLD."recordedByUserId",
      OLD."occurredAt",
      OLD."description",
      OLD."idempotencyKey",
      OLD."originTransactionId",
      OLD."reversalOfTransactionId",
      OLD."createdAt"
    ) IS NOT DISTINCT FROM ROW(
      NEW."id",
      NEW."type",
      NEW."amount",
      NEW."currency",
      NEW."financialScope",
      NEW."paymentMethod",
      NEW."billingStatus",
      NEW."categoryId",
      NEW."counterpartyUserId",
      NEW."counterpartyId",
      NEW."recipientUserId",
      NEW."recipientCounterpartyId",
      NEW."debtorUserId",
      NEW."debtorCounterpartyId",
      NEW."creditorUserId",
      NEW."creditorCounterpartyId",
      NEW."recordedByUserId",
      NEW."occurredAt",
      NEW."description",
      NEW."idempotencyKey",
      NEW."originTransactionId",
      NEW."reversalOfTransactionId",
      NEW."createdAt"
    )
  THEN
    -- Prisma maintains updatedAt on this status transition; it is audit
    -- metadata rather than a mutable ledger fact.
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'expense-linked money transaction facts are immutable'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MoneyTransaction_expense_immutability_trigger"
  BEFORE UPDATE OR DELETE ON "MoneyTransaction"
  FOR EACH ROW EXECUTE FUNCTION protect_expense_linked_money_transaction();

CREATE FUNCTION protect_locked_expense_core_facts() RETURNS trigger AS $$
DECLARE
  expense_id TEXT;
  expense_status "ExpenseStatus";
BEGIN
  IF TG_TABLE_NAME = 'Expense' THEN
    IF OLD."status" = 'DRAFT' THEN
      RETURN NEW;
    END IF;

    IF OLD."status" = 'POSTED'
      AND NEW."status" = 'REVERSED'
      AND ROW(
        OLD."id",
        OLD."legalEntityId",
        OLD."payeeId",
        OLD."categoryId",
        OLD."occurredOn",
        OLD."taxPointOn",
        OLD."currency",
        OLD."grossAmount",
        OLD."recognizedCostAmount",
        OLD."fiscalDeductibleAmount",
        OLD."notes",
        OLD."idempotencyKey",
        OLD."postIdempotencyKey",
        OLD."createdByUserId",
        OLD."postedByUserId",
        OLD."postedAt",
        OLD."createdAt"
      ) IS NOT DISTINCT FROM ROW(
        NEW."id",
        NEW."legalEntityId",
        NEW."payeeId",
        NEW."categoryId",
        NEW."occurredOn",
        NEW."taxPointOn",
        NEW."currency",
        NEW."grossAmount",
        NEW."recognizedCostAmount",
        NEW."fiscalDeductibleAmount",
        NEW."notes",
        NEW."idempotencyKey",
        NEW."postIdempotencyKey",
        NEW."createdByUserId",
        NEW."postedByUserId",
        NEW."postedAt",
        NEW."createdAt"
      )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'posted and reversed expense facts are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'ExpensePayment' THEN
    expense_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."expenseId" ELSE NEW."expenseId" END;
  ELSIF TG_TABLE_NAME = 'ExpenseCostPool' THEN
    expense_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."expenseId" ELSE NEW."expenseId" END;
  ELSIF TG_TABLE_NAME = 'ExpenseCostAttribution' THEN
    SELECT pool."expenseId" INTO expense_id
    FROM "ExpenseCostPool" AS pool
    WHERE pool."id" = CASE
      WHEN TG_OP = 'DELETE' THEN OLD."costPoolId"
      ELSE NEW."costPoolId"
    END;
  ELSIF TG_TABLE_NAME = 'ExpenseReference' THEN
    expense_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."expenseId" ELSE NEW."expenseId" END;
  END IF;

  SELECT expense."status" INTO expense_status
  FROM "Expense" AS expense
  WHERE expense."id" = expense_id
  FOR SHARE OF expense;

  IF expense_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'posted and reversed expense payment and allocation facts are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Expense_locked_core_facts_trigger"
  BEFORE UPDATE ON "Expense"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_expense_core_facts();
CREATE TRIGGER "ExpensePayment_locked_facts_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "ExpensePayment"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_expense_core_facts();
CREATE TRIGGER "ExpenseCostPool_locked_facts_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseCostPool"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_expense_core_facts();
CREATE TRIGGER "ExpenseCostAttribution_locked_facts_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseCostAttribution"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_expense_core_facts();
CREATE TRIGGER "ExpenseReference_locked_facts_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseReference"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_expense_core_facts();

CREATE FUNCTION protect_posted_business_owner_history() RETURNS trigger AS $$
BEGIN
  PERFORM 1
  FROM "ExpenseCostAttribution" AS attribution
  JOIN "ExpenseCostPool" AS pool ON pool."id" = attribution."costPoolId"
  JOIN "Expense" AS expense ON expense."id" = pool."expenseId"
  WHERE attribution."businessOwnerId" = OLD."id"
  FOR SHARE OF expense;

  IF EXISTS (
    SELECT 1
    FROM "ExpenseCostAttribution" AS attribution
    JOIN "ExpenseCostPool" AS pool ON pool."id" = attribution."costPoolId"
    JOIN "Expense" AS expense ON expense."id" = pool."expenseId"
    WHERE attribution."businessOwnerId" = OLD."id"
      AND expense."status" IN ('POSTED', 'REVERSED')
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'a business owner referenced by posted history is immutable'
        USING ERRCODE = '23514';
    END IF;
    IF ROW(
      OLD."legalEntityId",
      OLD."userId"
    ) IS DISTINCT FROM ROW(
      NEW."legalEntityId",
      NEW."userId"
    ) THEN
      RAISE EXCEPTION 'a business owner identity referenced by posted history is immutable'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM "ExpenseCostAttribution" AS attribution
      JOIN "ExpenseCostPool" AS pool ON pool."id" = attribution."costPoolId"
      JOIN "Expense" AS expense ON expense."id" = pool."expenseId"
      WHERE attribution."businessOwnerId" = OLD."id"
        AND expense."status" IN ('POSTED', 'REVERSED')
        AND (
          expense."occurredOn" < NEW."effectiveFrom"
          OR (NEW."effectiveTo" IS NOT NULL AND expense."occurredOn" >= NEW."effectiveTo")
        )
    ) THEN
      RAISE EXCEPTION 'owner effective dates cannot invalidate a posted expense'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BusinessOwner_posted_history_trigger"
  BEFORE UPDATE OR DELETE ON "BusinessOwner"
  FOR EACH ROW EXECUTE FUNCTION protect_posted_business_owner_history();

CREATE FUNCTION protect_referenced_expense_wallet_type() RETURNS trigger AS $$
BEGIN
  PERFORM 1
  FROM "Expense" AS expense
  WHERE expense."id" IN (
    SELECT payment."expenseId"
    FROM "ExpensePayment" AS payment
    WHERE payment."companyWalletId" = OLD."id"
    UNION
    SELECT claim."expenseId"
    FROM "ExpenseReimbursementSettlement" AS settlement
    JOIN "ExpenseReimbursementClaim" AS claim ON claim."id" = settlement."claimId"
    WHERE settlement."companyWalletId" = OLD."id"
  )
  FOR SHARE OF expense;

  IF OLD."type" IS DISTINCT FROM NEW."type" AND (
    EXISTS (
      SELECT 1
      FROM "ExpensePayment" AS payment
      JOIN "Expense" AS expense ON expense."id" = payment."expenseId"
      WHERE payment."companyWalletId" = OLD."id"
        AND expense."status" IN ('POSTED', 'REVERSED')
    )
    OR EXISTS (
      SELECT 1
      FROM "ExpenseReimbursementSettlement" AS settlement
      JOIN "ExpenseReimbursementClaim" AS claim ON claim."id" = settlement."claimId"
      JOIN "Expense" AS expense ON expense."id" = claim."expenseId"
      WHERE settlement."companyWalletId" = OLD."id"
        AND expense."status" IN ('POSTED', 'REVERSED')
    )
  ) THEN
    RAISE EXCEPTION 'wallet type is immutable once referenced by posted expense history'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Wallet_expense_history_type_trigger"
  BEFORE UPDATE OF "type" ON "Wallet"
  FOR EACH ROW EXECUTE FUNCTION protect_referenced_expense_wallet_type();

-- Cross-table invariants cannot be represented by Prisma CHECK constraints.
-- Deferred constraint triggers validate the aggregate after every transaction,
-- allowing nested creates/updates while rejecting an inconsistent final state.
CREATE FUNCTION validate_expense_consistency() RETURNS trigger AS $$
DECLARE
  expense_id TEXT;
  state RECORD;
  owner_state RECORD;
  tax_state RECORD;
  tax_sums RECORD;
  claim_state RECORD;
  effective_vat_period_id TEXT;
  effective_vat_country_code TEXT;
  effective_vat_number TEXT;
  company_wallet_type "WalletType";
  claim_count INTEGER;
  payment_posting_count INTEGER;
  reversal_posting_count INTEGER;
  invalid_payment_posting_count INTEGER;
  invalid_reversal_posting_count INTEGER;
  settlement_count INTEGER;
  settlement_posting_count INTEGER;
  invalid_settlement_wallet_count INTEGER;
  invalid_settlement_posting_count INTEGER;
  settlement_total DECIMAL(19,2);
  qualifying_document_count INTEGER;
  invalid_document_count INTEGER;
  invalid_tax_recovery_count INTEGER;
  should_reimburse BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    CASE TG_TABLE_NAME
      WHEN 'ExpensePayment' THEN expense_id := OLD."expenseId";
      WHEN 'ExpenseCostPool' THEN expense_id := OLD."expenseId";
      WHEN 'ExpenseCostAttribution' THEN
        SELECT pool."expenseId" INTO expense_id
        FROM "ExpenseCostPool" AS pool
        WHERE pool."id" = OLD."costPoolId";
      WHEN 'ExpenseTaxSnapshot' THEN expense_id := OLD."expenseId";
      WHEN 'ExpenseTaxLine' THEN
        SELECT snapshot."expenseId" INTO expense_id
        FROM "ExpenseTaxSnapshot" AS snapshot
        WHERE snapshot."id" = OLD."taxSnapshotId";
      WHEN 'ExpenseDocument' THEN expense_id := OLD."expenseId";
      WHEN 'ExpenseReimbursementClaim' THEN expense_id := OLD."expenseId";
      WHEN 'ExpenseReimbursementSettlement' THEN
        SELECT claim."expenseId" INTO expense_id
        FROM "ExpenseReimbursementClaim" AS claim
        WHERE claim."id" = OLD."claimId";
      WHEN 'ExpensePosting' THEN expense_id := OLD."expenseId";
      WHEN 'MoneyTransaction' THEN
        SELECT posting."expenseId" INTO expense_id
        FROM "ExpensePosting" AS posting
        WHERE posting."moneyTransactionId" = OLD."id";
      WHEN 'WalletBalanceChange' THEN
        SELECT posting."expenseId" INTO expense_id
        FROM "ExpensePosting" AS posting
        WHERE posting."moneyTransactionId" = OLD."moneyTransactionId";
      ELSE RETURN NULL;
    END CASE;
  ELSE
    CASE TG_TABLE_NAME
      WHEN 'Expense' THEN expense_id := NEW."id";
      WHEN 'ExpensePayment' THEN expense_id := NEW."expenseId";
      WHEN 'ExpenseCostPool' THEN expense_id := NEW."expenseId";
      WHEN 'ExpenseCostAttribution' THEN
        SELECT pool."expenseId" INTO expense_id
        FROM "ExpenseCostPool" AS pool
        WHERE pool."id" = NEW."costPoolId";
      WHEN 'ExpenseTaxSnapshot' THEN expense_id := NEW."expenseId";
      WHEN 'ExpenseTaxLine' THEN
        SELECT snapshot."expenseId" INTO expense_id
        FROM "ExpenseTaxSnapshot" AS snapshot
        WHERE snapshot."id" = NEW."taxSnapshotId";
      WHEN 'ExpenseDocument' THEN expense_id := NEW."expenseId";
      WHEN 'ExpenseReimbursementClaim' THEN expense_id := NEW."expenseId";
      WHEN 'ExpenseReimbursementSettlement' THEN
        SELECT claim."expenseId" INTO expense_id
        FROM "ExpenseReimbursementClaim" AS claim
        WHERE claim."id" = NEW."claimId";
      WHEN 'ExpensePosting' THEN expense_id := NEW."expenseId";
      WHEN 'MoneyTransaction' THEN
        SELECT posting."expenseId" INTO expense_id
        FROM "ExpensePosting" AS posting
        WHERE posting."moneyTransactionId" = NEW."id";
      WHEN 'WalletBalanceChange' THEN
        SELECT posting."expenseId" INTO expense_id
        FROM "ExpensePosting" AS posting
        WHERE posting."moneyTransactionId" = NEW."moneyTransactionId";
      ELSE RETURN NULL;
    END CASE;
  END IF;

  IF expense_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    expense."id" AS expense_id,
    expense."legalEntityId" AS legal_entity_id,
    expense."status" AS expense_status,
    expense."occurredOn" AS occurred_on,
    expense."taxPointOn" AS tax_point_on,
    expense."currency" AS expense_currency,
    expense."grossAmount" AS expense_gross,
    expense."recognizedCostAmount" AS expense_recognized,
    expense."fiscalDeductibleAmount" AS fiscal_deductible,
    normalize_ro_tax_identifier(company."taxIdentifier") AS current_legal_entity_tax_identifier,
    payment."id" AS payment_id,
    payment."source" AS payment_source,
    payment."companyWalletId" AS company_wallet_id,
    payment."fundedByUserId" AS funded_by_user_id,
    payment."amount" AS payment_amount,
    payment."fundingTreatment" AS funding_treatment,
    pool."id" AS pool_id,
    pool."grossAmount" AS pool_gross,
    pool."recognizedCostAmount" AS pool_recognized,
    attribution."target" AS attribution_target,
    attribution."businessOwnerId" AS business_owner_id,
    attribution."allocatedGrossAmount" AS allocated_gross,
    attribution."allocatedRecognizedCostAmount" AS allocated_recognized
  INTO state
  FROM "Expense" AS expense
  JOIN "BusinessLegalEntity" AS entity ON entity."id" = expense."legalEntityId"
  JOIN "Company" AS company ON company."id" = entity."companyId"
  LEFT JOIN "ExpensePayment" AS payment ON payment."expenseId" = expense."id"
  LEFT JOIN "ExpenseCostPool" AS pool ON pool."expenseId" = expense."id"
  LEFT JOIN "ExpenseCostAttribution" AS attribution ON attribution."costPoolId" = pool."id"
  WHERE expense."id" = expense_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF state.payment_id IS NULL OR state.pool_id IS NULL OR state.attribution_target IS NULL THEN
    RAISE EXCEPTION 'expense % must have one payment, pool and attribution', expense_id
      USING ERRCODE = '23514';
  END IF;

  IF state.payment_amount <> state.expense_gross
    OR state.pool_gross <> state.expense_gross
    OR state.pool_recognized <> state.expense_recognized
    OR state.allocated_gross <> state.pool_gross
    OR state.allocated_recognized <> state.pool_recognized
  THEN
    RAISE EXCEPTION 'expense % payment and allocations must reconcile exactly', expense_id
      USING ERRCODE = '23514';
  END IF;

  should_reimburse :=
    state.payment_source = 'PERSONAL_FUNDS'
    AND state.attribution_target = 'BUSINESS';

  IF state.payment_source = 'COMPANY_CASH_DESK'
    AND state.attribution_target = 'OWNER'
  THEN
    RAISE EXCEPTION 'cash-desk expenses cannot target an owner'
      USING ERRCODE = '23514';
  END IF;

  IF (should_reimburse AND state.funding_treatment <> 'REIMBURSABLE')
    OR (NOT should_reimburse AND state.funding_treatment <> 'NON_REIMBURSABLE')
  THEN
    RAISE EXCEPTION 'expense % has an invalid locked funding treatment', expense_id
      USING ERRCODE = '23514';
  END IF;

  IF state.attribution_target = 'OWNER' THEN
    SELECT
      owner."legalEntityId" AS legal_entity_id,
      owner."effectiveFrom" AS effective_from,
      owner."effectiveTo" AS effective_to
    INTO owner_state
    FROM "BusinessOwner" AS owner
    WHERE owner."id" = state.business_owner_id;

    IF NOT FOUND
      OR owner_state.legal_entity_id <> state.legal_entity_id
      OR owner_state.effective_from > state.occurred_on
      OR (owner_state.effective_to IS NOT NULL AND owner_state.effective_to <= state.occurred_on)
    THEN
      RAISE EXCEPTION 'expense % owner attribution is not effective for the entity', expense_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF state.payment_source <> 'PERSONAL_FUNDS' THEN
    SELECT wallet."type" INTO company_wallet_type
    FROM "BusinessLegalEntityWallet" AS assignment
    JOIN "Wallet" AS wallet ON wallet."id" = assignment."walletId"
    WHERE assignment."legalEntityId" = state.legal_entity_id
      AND assignment."walletId" = state.company_wallet_id;

    IF NOT FOUND
      OR (state.payment_source = 'COMPANY_CASH_DESK' AND company_wallet_type <> 'COMPANY_CASH')
      OR (
        state.payment_source = 'COMPANY_CARD'
        AND company_wallet_type NOT IN ('COMPANY_BANK', 'PAYMENT_PROCESSOR')
      )
    THEN
      RAISE EXCEPTION 'expense % company wallet does not match its payment source', expense_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT period."id", period."countryCode", period."vatNumber"
  INTO effective_vat_period_id, effective_vat_country_code, effective_vat_number
  FROM "VatRegistrationPeriod" AS period
  WHERE period."legalEntityId" = state.legal_entity_id
    AND period."effectiveFrom" <= state.tax_point_on
    AND (period."effectiveTo" IS NULL OR period."effectiveTo" > state.tax_point_on);

  SELECT
    snapshot."vatRegistrationPeriodId" AS vat_period_id,
    snapshot."vatRegistrationCountryCode" AS vat_country_code,
    snapshot."vatRegistrationNumber" AS vat_number,
    snapshot."legalEntityTaxIdentifier" AS legal_entity_tax_identifier,
    snapshot."isVatRegistered" AS is_registered,
    snapshot."taxPointOn" AS tax_point_on,
    snapshot."grossAmount" AS gross_amount,
    snapshot."netAmount" AS net_amount,
    snapshot."vatAmount" AS vat_amount,
    snapshot."recoverableVatAmount" AS recoverable_amount,
    snapshot."nonRecoverableVatAmount" AS nonrecoverable_amount,
    snapshot."recognizedCostAmount" AS recognized_amount,
    snapshot."id" AS snapshot_id
  INTO tax_state
  FROM "ExpenseTaxSnapshot" AS snapshot
  WHERE snapshot."expenseId" = expense_id;

  IF NOT FOUND
    OR tax_state.tax_point_on <> state.tax_point_on
    OR tax_state.gross_amount <> state.expense_gross
    OR tax_state.recognized_amount <> state.expense_recognized
  THEN
    RAISE EXCEPTION 'expense % tax snapshot does not reconcile to the expense', expense_id
      USING ERRCODE = '23514';
  END IF;

  IF state.expense_status <> 'DRAFT' AND (
    tax_state.vat_period_id IS DISTINCT FROM effective_vat_period_id
    OR tax_state.vat_country_code IS DISTINCT FROM effective_vat_country_code
    OR tax_state.vat_number IS DISTINCT FROM effective_vat_number
    OR tax_state.legal_entity_tax_identifier IS DISTINCT FROM state.current_legal_entity_tax_identifier
    OR tax_state.is_registered <> (effective_vat_period_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'expense % tax snapshot does not match its effective facts', expense_id
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*) AS line_count,
    COALESCE(sum(line."netAmount"), 0) AS net_amount,
    COALESCE(sum(line."vatAmount"), 0) AS vat_amount,
    COALESCE(sum(line."grossAmount"), 0) AS gross_amount,
    COALESCE(sum(line."recoverableVatAmount"), 0) AS recoverable_amount,
    COALESCE(sum(line."nonRecoverableVatAmount"), 0) AS nonrecoverable_amount
  INTO tax_sums
  FROM "ExpenseTaxLine" AS line
  WHERE line."taxSnapshotId" = tax_state.snapshot_id;

  IF (tax_sums.line_count = 0 AND (
      tax_state.net_amount <> state.expense_gross
      OR tax_state.vat_amount <> 0
      OR tax_state.recoverable_amount <> 0
      OR tax_state.nonrecoverable_amount <> 0
    )) OR (tax_sums.line_count > 0 AND (
      tax_sums.net_amount <> tax_state.net_amount
      OR tax_sums.vat_amount <> tax_state.vat_amount
      OR tax_sums.gross_amount <> tax_state.gross_amount
      OR tax_sums.recoverable_amount <> tax_state.recoverable_amount
      OR tax_sums.nonrecoverable_amount <> tax_state.nonrecoverable_amount
    ))
  THEN
    RAISE EXCEPTION 'expense % tax lines do not reconcile to the snapshot', expense_id
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO invalid_document_count
  FROM "ExpenseDocument" AS document
  WHERE document."expenseId" = expense_id
    AND (
      (
        document."type" = 'POS_RECEIPT'
        AND (
          document."buyerCuiStatus" <> 'NOT_APPLICABLE'
          OR document."buyerTaxIdentifier" IS NOT NULL
        )
      ) OR (
        document."type" IN ('FISCAL_RECEIPT', 'INVOICE', 'CREDIT_NOTE')
        AND (
          document."buyerCuiStatus" = 'NOT_APPLICABLE'
          OR (
            document."buyerCuiStatus" = 'MATCHED'
            AND (
              document."buyerTaxIdentifier" IS NULL
              OR normalize_ro_tax_identifier(document."buyerTaxIdentifier")
                <> tax_state.legal_entity_tax_identifier
            )
          )
          OR (
            document."buyerCuiStatus" = 'MISSING'
            AND document."buyerTaxIdentifier" IS NOT NULL
          )
          OR (
            document."buyerCuiStatus" = 'MISMATCH'
            AND (
              document."buyerTaxIdentifier" IS NULL
              OR normalize_ro_tax_identifier(document."buyerTaxIdentifier")
                = tax_state.legal_entity_tax_identifier
            )
          )
        )
      )
    );

  IF invalid_document_count <> 0 THEN
    RAISE EXCEPTION 'expense % has invalid buyer tax evidence metadata', expense_id
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO qualifying_document_count
  FROM "ExpenseDocument" AS document
  WHERE document."expenseId" = expense_id
    AND document."type" IN ('FISCAL_RECEIPT', 'INVOICE')
    AND document."reviewStatus" = 'CONFIRMED'
    AND document."buyerCuiStatus" = 'MATCHED'
    AND document."buyerTaxIdentifier" IS NOT NULL
    AND normalize_ro_tax_identifier(document."buyerTaxIdentifier")
      = tax_state.legal_entity_tax_identifier;

  SELECT count(*) INTO invalid_tax_recovery_count
  FROM "ExpenseTaxLine" AS line
  WHERE line."taxSnapshotId" = tax_state.snapshot_id
    AND line."recoverableVatAmount" <> CASE
      WHEN effective_vat_period_id IS NOT NULL AND qualifying_document_count > 0
        THEN round(line."vatAmount" * line."deductiblePercent" / 100, 2)
      ELSE 0
    END;

  IF state.expense_status <> 'DRAFT' AND invalid_tax_recovery_count <> 0 THEN
    RAISE EXCEPTION 'expense % tax-line VAT recovery does not match deductibility', expense_id
      USING ERRCODE = '23514';
  END IF;

  IF state.expense_status <> 'DRAFT'
    AND qualifying_document_count = 0 AND (
      tax_state.recoverable_amount <> 0
      OR state.expense_recognized <> state.expense_gross
      OR state.fiscal_deductible <> 0
    )
  THEN
    RAISE EXCEPTION 'expense % lacks confirmed fiscal evidence for recovery or deductibility', expense_id
      USING ERRCODE = '23514';
  ELSIF state.expense_status <> 'DRAFT'
    AND qualifying_document_count > 0
    AND state.fiscal_deductible <> state.expense_recognized
  THEN
    RAISE EXCEPTION 'expense % fiscal deductible amount must equal recognized cost', expense_id
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO claim_count
  FROM "ExpenseReimbursementClaim" AS claim
  WHERE claim."expenseId" = expense_id;

  IF state.expense_status = 'DRAFT' AND claim_count <> 0 THEN
    RAISE EXCEPTION 'draft expense % cannot have a reimbursement claim', expense_id
      USING ERRCODE = '23514';
  ELSIF state.expense_status <> 'DRAFT' AND should_reimburse THEN
    IF claim_count <> 1 THEN
      RAISE EXCEPTION 'reimbursable expense % must have exactly one claim', expense_id
        USING ERRCODE = '23514';
    END IF;

    SELECT
      claim."id" AS claim_id,
      claim."expensePaymentId" AS payment_id,
      claim."legalEntityId" AS legal_entity_id,
      claim."claimantUserId" AS claimant_user_id,
      claim."status" AS claim_status,
      claim."originalAmount" AS original_amount,
      claim."settledAmount" AS settled_amount,
      claim."currency" AS claim_currency
    INTO claim_state
    FROM "ExpenseReimbursementClaim" AS claim
    WHERE claim."expenseId" = expense_id;

    IF claim_state.payment_id <> state.payment_id
      OR claim_state.legal_entity_id <> state.legal_entity_id
      OR claim_state.claimant_user_id <> state.funded_by_user_id
      OR claim_state.original_amount <> state.expense_gross
      OR claim_state.claim_currency <> state.expense_currency
      OR (state.expense_status = 'REVERSED' AND claim_state.claim_status <> 'CANCELLED')
      OR (state.expense_status = 'POSTED' AND claim_state.claim_status = 'CANCELLED')
    THEN
      RAISE EXCEPTION 'expense % reimbursement claim does not match its funder', expense_id
        USING ERRCODE = '23514';
    END IF;

    SELECT
      COALESCE(sum(settlement."amount"), 0),
      count(settlement."id"),
      count(posting."id"),
      count(settlement."id") FILTER (
        WHERE assignment."id" IS NULL
          OR wallet."id" IS NULL
          OR wallet."type" = 'USER'
      ),
      count(settlement."id") FILTER (
        WHERE posting."id" IS NULL
          OR settlement_transaction."type" <> 'REIMBURSEMENT'
          OR settlement_transaction."status" <> 'POSTED'
          OR settlement_transaction."financialScope" <> 'COMPANY'
          OR settlement_transaction."amount" <> settlement."amount"
          OR settlement_transaction."currency" <> claim_state.claim_currency
          OR settlement_transaction."recipientUserId" IS DISTINCT FROM claim_state.claimant_user_id
          OR (
            SELECT count(*)
            FROM "WalletBalanceChange" AS change
            WHERE change."moneyTransactionId" = settlement_transaction."id"
          ) <> 1
          OR NOT EXISTS (
            SELECT 1
            FROM "WalletBalanceChange" AS change
            WHERE change."moneyTransactionId" = settlement_transaction."id"
              AND change."walletId" = settlement."companyWalletId"
              AND change."bucket" = 'BUSINESS_FUNDS'
              AND change."currency" = claim_state.claim_currency
              AND change."amountDelta" = -settlement."amount"
          )
      )
    INTO
      settlement_total,
      settlement_count,
      settlement_posting_count,
      invalid_settlement_wallet_count,
      invalid_settlement_posting_count
    FROM "ExpenseReimbursementSettlement" AS settlement
    LEFT JOIN "BusinessLegalEntityWallet" AS assignment
      ON assignment."legalEntityId" = claim_state.legal_entity_id
      AND assignment."walletId" = settlement."companyWalletId"
    LEFT JOIN "Wallet" AS wallet
      ON wallet."id" = settlement."companyWalletId"
    LEFT JOIN "ExpensePosting" AS posting
      ON posting."reimbursementSettlementId" = settlement."id"
      AND posting."expenseId" = expense_id
      AND posting."role" = 'REIMBURSEMENT_SETTLEMENT'
    LEFT JOIN "MoneyTransaction" AS settlement_transaction
      ON settlement_transaction."id" = posting."moneyTransactionId"
    WHERE settlement."claimId" = claim_state.claim_id;

    IF settlement_total <> claim_state.settled_amount
      OR settlement_posting_count <> settlement_count
      OR invalid_settlement_wallet_count <> 0
      OR invalid_settlement_posting_count <> 0
      OR (
        claim_state.claim_status = 'CANCELLED'
        AND (claim_state.settled_amount <> 0 OR settlement_count <> 0)
      )
    THEN
      RAISE EXCEPTION 'expense % reimbursement settlements are inconsistent', expense_id
        USING ERRCODE = '23514';
    END IF;
  ELSIF claim_count <> 0 THEN
    RAISE EXCEPTION 'non-reimbursable expense % cannot have a claim', expense_id
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*) FILTER (WHERE posting."role" = 'EXPENSE_PAYMENT'),
    count(*) FILTER (WHERE posting."role" = 'EXPENSE_REVERSAL'),
    count(*) FILTER (
      WHERE posting."role" = 'EXPENSE_PAYMENT'
        AND (
          posting."paymentId" IS DISTINCT FROM state.payment_id
          OR ledger."type" <> 'EXPENSE'
          OR ledger."status" <> CASE
            WHEN state.expense_status = 'REVERSED' THEN 'REVERSED'::"MoneyTransactionStatus"
            ELSE 'POSTED'::"MoneyTransactionStatus"
          END
          OR ledger."financialScope" <> 'COMPANY'
          OR ledger."amount" <> state.expense_gross
          OR ledger."currency" <> state.expense_currency
          OR ledger."categoryId" IS DISTINCT FROM (
            SELECT expense."categoryId" FROM "Expense" AS expense WHERE expense."id" = expense_id
          )
          OR ledger."counterpartyId" IS DISTINCT FROM (
            SELECT expense."payeeId" FROM "Expense" AS expense WHERE expense."id" = expense_id
          )
          OR (
            SELECT count(*)
            FROM "WalletBalanceChange" AS change
            WHERE change."moneyTransactionId" = ledger."id"
          ) <> 1
          OR NOT EXISTS (
            SELECT 1
            FROM "WalletBalanceChange" AS change
            WHERE change."moneyTransactionId" = ledger."id"
              AND change."walletId" = state.company_wallet_id
              AND change."bucket" = 'BUSINESS_FUNDS'
              AND change."currency" = state.expense_currency
              AND change."amountDelta" = -state.expense_gross
          )
        )
    ),
    count(*) FILTER (
      WHERE posting."role" = 'EXPENSE_REVERSAL'
        AND (
          ledger."type" <> 'REVERSAL'
          OR ledger."status" <> 'POSTED'
          OR ledger."financialScope" <> 'COMPANY'
          OR ledger."amount" <> state.expense_gross
          OR ledger."currency" <> state.expense_currency
          OR ledger."reversalOfTransactionId" IS DISTINCT FROM (
            SELECT payment_posting."moneyTransactionId"
            FROM "ExpensePosting" AS payment_posting
            WHERE payment_posting."expenseId" = expense_id
              AND payment_posting."role" = 'EXPENSE_PAYMENT'
          )
          OR (
            SELECT count(*)
            FROM "WalletBalanceChange" AS change
            WHERE change."moneyTransactionId" = ledger."id"
          ) <> 1
          OR NOT EXISTS (
            SELECT 1
            FROM "WalletBalanceChange" AS change
            WHERE change."moneyTransactionId" = ledger."id"
              AND change."walletId" = state.company_wallet_id
              AND change."bucket" = 'BUSINESS_FUNDS'
              AND change."currency" = state.expense_currency
              AND change."amountDelta" = state.expense_gross
          )
        )
    )
  INTO
    payment_posting_count,
    reversal_posting_count,
    invalid_payment_posting_count,
    invalid_reversal_posting_count
  FROM "ExpensePosting" AS posting
  JOIN "MoneyTransaction" AS ledger ON ledger."id" = posting."moneyTransactionId"
  WHERE posting."expenseId" = expense_id;

  IF invalid_payment_posting_count <> 0 OR invalid_reversal_posting_count <> 0 THEN
    RAISE EXCEPTION 'expense % has an invalid ledger posting', expense_id
      USING ERRCODE = '23514';
  ELSIF state.expense_status = 'DRAFT'
    AND (payment_posting_count <> 0 OR reversal_posting_count <> 0)
  THEN
    RAISE EXCEPTION 'draft expense % cannot have ledger postings', expense_id
      USING ERRCODE = '23514';
  ELSIF state.payment_source = 'PERSONAL_FUNDS'
    AND (payment_posting_count <> 0 OR reversal_posting_count <> 0)
  THEN
    RAISE EXCEPTION 'personal-funded expense % cannot move a company wallet', expense_id
      USING ERRCODE = '23514';
  ELSIF state.payment_source <> 'PERSONAL_FUNDS' AND state.expense_status = 'POSTED'
    AND (payment_posting_count <> 1 OR reversal_posting_count <> 0)
  THEN
    RAISE EXCEPTION 'posted company-funded expense % requires one cash posting', expense_id
      USING ERRCODE = '23514';
  ELSIF state.payment_source <> 'PERSONAL_FUNDS' AND state.expense_status = 'REVERSED'
    AND (payment_posting_count <> 1 OR reversal_posting_count <> 1)
  THEN
    RAISE EXCEPTION 'reversed company-funded expense % requires payment and reversal postings', expense_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_business_legal_entity_wallet_assignment() RETURNS trigger AS $$
DECLARE
  wallet_state RECORD;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    SELECT wallet."type" AS wallet_type, wallet."isActive" AS is_active
    INTO wallet_state
    FROM "Wallet" AS wallet
    WHERE wallet."id" = NEW."walletId";

    IF NOT FOUND OR NOT wallet_state.is_active OR wallet_state.wallet_type = 'USER' THEN
      RAISE EXCEPTION 'only an active company wallet can be assigned to a business legal entity'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP <> 'INSERT'
    AND (
      EXISTS (
        SELECT 1
        FROM "ExpensePayment" AS payment
        JOIN "Expense" AS expense ON expense."id" = payment."expenseId"
        WHERE payment."companyWalletId" = OLD."walletId"
          AND expense."legalEntityId" = OLD."legalEntityId"
      )
      OR EXISTS (
        SELECT 1
        FROM "ExpenseReimbursementSettlement" AS settlement
        JOIN "ExpenseReimbursementClaim" AS claim ON claim."id" = settlement."claimId"
        WHERE settlement."companyWalletId" = OLD."walletId"
          AND claim."legalEntityId" = OLD."legalEntityId"
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "BusinessLegalEntityWallet" AS assignment
      WHERE assignment."legalEntityId" = OLD."legalEntityId"
        AND assignment."walletId" = OLD."walletId"
    )
  THEN
    RAISE EXCEPTION 'a wallet referenced by an expense payment cannot be removed or reassigned'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "BusinessLegalEntityWallet_reference_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "BusinessLegalEntityWallet"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_business_legal_entity_wallet_assignment();

CREATE CONSTRAINT TRIGGER "Expense_consistency_trigger"
  AFTER INSERT OR UPDATE ON "Expense"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_expense_consistency();
CREATE CONSTRAINT TRIGGER "ExpensePayment_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "ExpensePayment"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_expense_consistency();
CREATE CONSTRAINT TRIGGER "ExpenseCostPool_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "ExpenseCostPool"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_expense_consistency();
CREATE CONSTRAINT TRIGGER "ExpenseCostAttribution_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "ExpenseCostAttribution"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_expense_consistency();
CREATE CONSTRAINT TRIGGER "ExpenseTaxSnapshot_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "ExpenseTaxSnapshot"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_expense_consistency();
CREATE CONSTRAINT TRIGGER "ExpenseTaxLine_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "ExpenseTaxLine"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_expense_consistency();
CREATE CONSTRAINT TRIGGER "ExpenseDocument_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "ExpenseDocument"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_expense_consistency();
CREATE CONSTRAINT TRIGGER "ExpenseReimbursementClaim_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "ExpenseReimbursementClaim"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_expense_consistency();
CREATE CONSTRAINT TRIGGER "ExpenseReimbursementSettlement_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "ExpenseReimbursementSettlement"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_expense_consistency();
CREATE CONSTRAINT TRIGGER "ExpensePosting_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "ExpensePosting"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_expense_consistency();
CREATE CONSTRAINT TRIGGER "MoneyTransaction_expense_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "MoneyTransaction"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_expense_consistency();
CREATE CONSTRAINT TRIGGER "WalletBalanceChange_expense_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "WalletBalanceChange"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_expense_consistency();
