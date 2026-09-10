-- Rebuilds the financial module as a double-entry ledger.
--
-- Design reference: docs/finance/financial-system-architecture.md
--
-- The DDL below is Prisma's diff of the schema. Everything after the
-- "Domain invariants" banner is hand-written: constraints the Prisma schema
-- language cannot express. Application code validates the same rules first so
-- users get readable errors — these are the last line of defence.

-- CreateEnum
CREATE TYPE "FinanceBookType" AS ENUM ('COMPANY', 'ASSOCIATE_POOL');

-- CreateEnum
CREATE TYPE "FinancialOperationKind" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER', 'ASSOCIATE_FUNDING', 'REIMBURSEMENT', 'PERSONAL_USE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "FinancialOperationStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "LedgerAccountCategory" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "LedgerAccountRole" AS ENUM ('BANK', 'CASH_REGISTER', 'COMPANY_CASH_CUSTODY', 'ASSOCIATE_POOL_CASH_CUSTODY', 'PAYABLE_TO_ASSOCIATE', 'RECEIVABLE_FROM_ASSOCIATE', 'ASSOCIATE_LOAN_PAYABLE', 'OPERATING_EXPENSE', 'NON_OPERATIONAL_COMPANY_EXPENSE', 'ASSOCIATE_POOL_EXPENSE', 'FIXED_ASSET', 'RENTAL_REVENUE', 'SCOOTER_SALE_REVENUE', 'ASSOCIATE_POOL_REVENUE');

-- CreateEnum
CREATE TYPE "ExpenseTreatment" AS ENUM ('OPERATING_EXPENSE', 'NON_OPERATIONAL_COMPANY_EXPENSE', 'CAPITAL_ASSET', 'ASSOCIATE_POOL_EXPENSE');

-- CreateEnum
CREATE TYPE "ExpensePaymentSourceType" AS ENUM ('BOOK_ACCOUNT', 'ASSOCIATE_PERSONAL_FUNDS');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "EconomicAllocationType" AS ENUM ('COMMON', 'ASSOCIATE_SPECIFIC');

-- CreateEnum
CREATE TYPE "IncomeType" AS ENUM ('RENTAL', 'SCOOTER_SALE');

-- CreateEnum
CREATE TYPE "AssociateFundingType" AS ENUM ('LOAN');

-- CreateEnum
CREATE TYPE "ReimbursementType" AS ENUM ('EXPENSE_ADVANCE_REPAYMENT', 'ASSOCIATE_LOAN_REPAYMENT', 'ASSOCIATE_RECEIVABLE_REPAYMENT');

-- CreateEnum
CREATE TYPE "CostObjectType" AS ENUM ('SCOOTER', 'VEHICLE', 'PROPERTY', 'OFFICE', 'FLEET', 'EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CostObjectOwnershipType" AS ENUM ('COMPANY', 'ASSOCIATE', 'SHARED', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "FinancialDocumentType" AS ENUM ('RECEIPT', 'INVOICE', 'CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "SettlementRunKind" AS ENUM ('COMPANY_SPECIFIC_BENEFIT', 'ASSOCIATE_POOL_CASH');

-- CreateEnum
CREATE TYPE "SettlementRunStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SettlementTransferStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
-- CreateTable
CREATE TABLE "FinanceBook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinanceBookType" NOT NULL,
    "functionalCurrency" TEXT NOT NULL DEFAULT 'RON',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBookMember" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "associateId" TEXT NOT NULL,
    "shareBasisPoints" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceBookMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "LedgerAccountCategory" NOT NULL,
    "role" "LedgerAccountRole" NOT NULL,
    "associateId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialOperation" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "kind" "FinancialOperationKind" NOT NULL,
    "status" "FinancialOperationStatus" NOT NULL DEFAULT 'DRAFT',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "reversalOfOperationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultTreatment" "ExpenseTreatment",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostObject" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CostObjectType" NOT NULL,
    "ownershipType" "CostObjectOwnershipType" NOT NULL,
    "ownerAssociateId" TEXT,
    "externalEntityType" TEXT,
    "externalEntityId" TEXT,
    "defaultAllocationType" "EconomicAllocationType",
    "defaultBeneficiaryAssociateId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "treatment" "ExpenseTreatment" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "costObjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpensePayment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "sourceType" "ExpensePaymentSourceType" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "sourceAccountId" TEXT,
    "payerAssociateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpensePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomicAllocation" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "type" "EconomicAllocationType" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "associateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EconomicAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialDocument" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "type" "FinancialDocumentType" NOT NULL,
    "documentNumber" TEXT,
    "issuedAt" TIMESTAMP(3),
    "supplierName" TEXT,
    "supplierTaxId" TEXT,
    "storageKey" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "type" "IncomeType" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "destinationAccountId" TEXT NOT NULL,
    "rentalId" TEXT,
    "scooterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyTransfer" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssociateFunding" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "type" "AssociateFundingType" NOT NULL DEFAULT 'LOAN',
    "associateId" TEXT NOT NULL,
    "destinationAccountId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssociateFunding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reimbursement" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "type" "ReimbursementType" NOT NULL,
    "associateId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "obligationAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reimbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalUse" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "associateId" TEXT NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalPosting" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "signedAmountMinor" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementRun" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "kind" "SettlementRunKind" NOT NULL,
    "status" "SettlementRunStatus" NOT NULL DEFAULT 'DRAFT',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementShareSnapshot" (
    "id" TEXT NOT NULL,
    "settlementRunId" TEXT NOT NULL,
    "associateId" TEXT NOT NULL,
    "shareBasisPoints" INTEGER NOT NULL,

    CONSTRAINT "SettlementShareSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementLine" (
    "id" TEXT NOT NULL,
    "settlementRunId" TEXT NOT NULL,
    "associateId" TEXT NOT NULL,
    "actualAmountMinor" INTEGER NOT NULL,
    "expectedAmountMinor" INTEGER NOT NULL,
    "adjustmentMinor" INTEGER NOT NULL,

    CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementTransfer" (
    "id" TEXT NOT NULL,
    "settlementRunId" TEXT NOT NULL,
    "fromAssociateId" TEXT NOT NULL,
    "toAssociateId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "status" "SettlementTransferStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentMethod",
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "SettlementTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementOperation" (
    "settlementRunId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,

    CONSTRAINT "SettlementOperation_pkey" PRIMARY KEY ("settlementRunId","operationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBook_type_key" ON "FinanceBook"("type");

-- CreateIndex
CREATE INDEX "FinanceBookMember_bookId_validFrom_validUntil_idx" ON "FinanceBookMember"("bookId", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "FinanceBookMember_associateId_idx" ON "FinanceBookMember"("associateId");

-- CreateIndex
CREATE INDEX "LedgerAccount_bookId_role_idx" ON "LedgerAccount"("bookId", "role");

-- CreateIndex
CREATE INDEX "LedgerAccount_bookId_associateId_idx" ON "LedgerAccount"("bookId", "associateId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_bookId_code_key" ON "LedgerAccount"("bookId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialOperation_reversalOfOperationId_key" ON "FinancialOperation"("reversalOfOperationId");

-- CreateIndex
CREATE INDEX "FinancialOperation_bookId_occurredAt_idx" ON "FinancialOperation"("bookId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialOperation_bookId_kind_status_idx" ON "FinancialOperation"("bookId", "kind", "status");

-- CreateIndex
CREATE INDEX "FinancialOperation_status_idx" ON "FinancialOperation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialOperation_bookId_idempotencyKey_key" ON "FinancialOperation"("bookId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ExpenseCategory_bookId_isActive_idx" ON "ExpenseCategory"("bookId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_bookId_code_key" ON "ExpenseCategory"("bookId", "code");

-- CreateIndex
CREATE INDEX "CostObject_bookId_type_idx" ON "CostObject"("bookId", "type");

-- CreateIndex
CREATE INDEX "CostObject_ownerAssociateId_idx" ON "CostObject"("ownerAssociateId");

-- CreateIndex
CREATE INDEX "CostObject_externalEntityType_externalEntityId_idx" ON "CostObject"("externalEntityType", "externalEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "CostObject_bookId_code_key" ON "CostObject"("bookId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_operationId_key" ON "Expense"("operationId");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE INDEX "Expense_costObjectId_idx" ON "Expense"("costObjectId");

-- CreateIndex
CREATE INDEX "Expense_treatment_idx" ON "Expense"("treatment");

-- CreateIndex
CREATE INDEX "ExpensePayment_expenseId_idx" ON "ExpensePayment"("expenseId");

-- CreateIndex
CREATE INDEX "ExpensePayment_payerAssociateId_idx" ON "ExpensePayment"("payerAssociateId");

-- CreateIndex
CREATE INDEX "ExpensePayment_sourceAccountId_idx" ON "ExpensePayment"("sourceAccountId");

-- CreateIndex
CREATE INDEX "EconomicAllocation_operationId_idx" ON "EconomicAllocation"("operationId");

-- CreateIndex
CREATE INDEX "EconomicAllocation_associateId_idx" ON "EconomicAllocation"("associateId");

-- CreateIndex
CREATE INDEX "FinancialDocument_operationId_idx" ON "FinancialDocument"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "Income_operationId_key" ON "Income"("operationId");

-- CreateIndex
CREATE INDEX "Income_destinationAccountId_idx" ON "Income"("destinationAccountId");

-- CreateIndex
CREATE INDEX "Income_rentalId_idx" ON "Income"("rentalId");

-- CreateIndex
CREATE INDEX "Income_scooterId_idx" ON "Income"("scooterId");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyTransfer_operationId_key" ON "MoneyTransfer"("operationId");

-- CreateIndex
CREATE INDEX "MoneyTransfer_fromAccountId_idx" ON "MoneyTransfer"("fromAccountId");

-- CreateIndex
CREATE INDEX "MoneyTransfer_toAccountId_idx" ON "MoneyTransfer"("toAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AssociateFunding_operationId_key" ON "AssociateFunding"("operationId");

-- CreateIndex
CREATE INDEX "AssociateFunding_associateId_idx" ON "AssociateFunding"("associateId");

-- CreateIndex
CREATE INDEX "AssociateFunding_destinationAccountId_idx" ON "AssociateFunding"("destinationAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Reimbursement_operationId_key" ON "Reimbursement"("operationId");

-- CreateIndex
CREATE INDEX "Reimbursement_associateId_idx" ON "Reimbursement"("associateId");

-- CreateIndex
CREATE INDEX "Reimbursement_cashAccountId_idx" ON "Reimbursement"("cashAccountId");

-- CreateIndex
CREATE INDEX "Reimbursement_obligationAccountId_idx" ON "Reimbursement"("obligationAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalUse_operationId_key" ON "PersonalUse"("operationId");

-- CreateIndex
CREATE INDEX "PersonalUse_associateId_idx" ON "PersonalUse"("associateId");

-- CreateIndex
CREATE INDEX "PersonalUse_sourceAccountId_idx" ON "PersonalUse"("sourceAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_operationId_key" ON "JournalEntry"("operationId");

-- CreateIndex
CREATE INDEX "JournalPosting_journalEntryId_idx" ON "JournalPosting"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalPosting_accountId_idx" ON "JournalPosting"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalPosting_journalEntryId_lineNumber_key" ON "JournalPosting"("journalEntryId", "lineNumber");

-- CreateIndex
CREATE INDEX "SettlementRun_bookId_kind_periodStart_periodEnd_idx" ON "SettlementRun"("bookId", "kind", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "SettlementRun_status_idx" ON "SettlementRun"("status");

-- CreateIndex
CREATE INDEX "SettlementShareSnapshot_associateId_idx" ON "SettlementShareSnapshot"("associateId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementShareSnapshot_settlementRunId_associateId_key" ON "SettlementShareSnapshot"("settlementRunId", "associateId");

-- CreateIndex
CREATE INDEX "SettlementLine_associateId_idx" ON "SettlementLine"("associateId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementLine_settlementRunId_associateId_key" ON "SettlementLine"("settlementRunId", "associateId");

-- CreateIndex
CREATE INDEX "SettlementTransfer_settlementRunId_idx" ON "SettlementTransfer"("settlementRunId");

-- CreateIndex
CREATE INDEX "SettlementTransfer_fromAssociateId_idx" ON "SettlementTransfer"("fromAssociateId");

-- CreateIndex
CREATE INDEX "SettlementTransfer_toAssociateId_idx" ON "SettlementTransfer"("toAssociateId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementOperation_operationId_key" ON "SettlementOperation"("operationId");
-- AddForeignKey
ALTER TABLE "FinanceBookMember" ADD CONSTRAINT "FinanceBookMember_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBookMember" ADD CONSTRAINT "FinanceBookMember_associateId_fkey" FOREIGN KEY ("associateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_associateId_fkey" FOREIGN KEY ("associateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialOperation" ADD CONSTRAINT "FinancialOperation_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialOperation" ADD CONSTRAINT "FinancialOperation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialOperation" ADD CONSTRAINT "FinancialOperation_reversalOfOperationId_fkey" FOREIGN KEY ("reversalOfOperationId") REFERENCES "FinancialOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostObject" ADD CONSTRAINT "CostObject_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostObject" ADD CONSTRAINT "CostObject_ownerAssociateId_fkey" FOREIGN KEY ("ownerAssociateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostObject" ADD CONSTRAINT "CostObject_defaultBeneficiaryAssociateId_fkey" FOREIGN KEY ("defaultBeneficiaryAssociateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "FinancialOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_costObjectId_fkey" FOREIGN KEY ("costObjectId") REFERENCES "CostObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_payerAssociateId_fkey" FOREIGN KEY ("payerAssociateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomicAllocation" ADD CONSTRAINT "EconomicAllocation_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "FinancialOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomicAllocation" ADD CONSTRAINT "EconomicAllocation_associateId_fkey" FOREIGN KEY ("associateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "FinancialOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "FinancialOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "FinancialOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssociateFunding" ADD CONSTRAINT "AssociateFunding_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "FinancialOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssociateFunding" ADD CONSTRAINT "AssociateFunding_associateId_fkey" FOREIGN KEY ("associateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssociateFunding" ADD CONSTRAINT "AssociateFunding_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "FinancialOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_associateId_fkey" FOREIGN KEY ("associateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_obligationAccountId_fkey" FOREIGN KEY ("obligationAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalUse" ADD CONSTRAINT "PersonalUse_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "FinancialOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalUse" ADD CONSTRAINT "PersonalUse_associateId_fkey" FOREIGN KEY ("associateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalUse" ADD CONSTRAINT "PersonalUse_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "FinancialOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalPosting" ADD CONSTRAINT "JournalPosting_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalPosting" ADD CONSTRAINT "JournalPosting_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementShareSnapshot" ADD CONSTRAINT "SettlementShareSnapshot_settlementRunId_fkey" FOREIGN KEY ("settlementRunId") REFERENCES "SettlementRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementShareSnapshot" ADD CONSTRAINT "SettlementShareSnapshot_associateId_fkey" FOREIGN KEY ("associateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_settlementRunId_fkey" FOREIGN KEY ("settlementRunId") REFERENCES "SettlementRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_associateId_fkey" FOREIGN KEY ("associateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementTransfer" ADD CONSTRAINT "SettlementTransfer_settlementRunId_fkey" FOREIGN KEY ("settlementRunId") REFERENCES "SettlementRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementTransfer" ADD CONSTRAINT "SettlementTransfer_fromAssociateId_fkey" FOREIGN KEY ("fromAssociateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementTransfer" ADD CONSTRAINT "SettlementTransfer_toAssociateId_fkey" FOREIGN KEY ("toAssociateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementOperation" ADD CONSTRAINT "SettlementOperation_settlementRunId_fkey" FOREIGN KEY ("settlementRunId") REFERENCES "SettlementRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementOperation" ADD CONSTRAINT "SettlementOperation_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "FinancialOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Domain invariants (finance spec §20, §21)
-- ---------------------------------------------------------------------------

-- Money is always a positive integer count of minor units. Direction is
-- carried by the operation kind and by JournalPosting.signedAmountMinor,
-- never by a negative amount on a domain record.
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "ExpensePayment"
  ADD CONSTRAINT "ExpensePayment_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "EconomicAllocation"
  ADD CONSTRAINT "EconomicAllocation_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Income"
  ADD CONSTRAINT "Income_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "MoneyTransfer"
  ADD CONSTRAINT "MoneyTransfer_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "AssociateFunding"
  ADD CONSTRAINT "AssociateFunding_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Reimbursement"
  ADD CONSTRAINT "Reimbursement_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "PersonalUse"
  ADD CONSTRAINT "PersonalUse_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "SettlementTransfer"
  ADD CONSTRAINT "SettlementTransfer_amount_positive" CHECK ("amountMinor" > 0);

-- A posting line of zero moves nothing and only obscures the entry.
ALTER TABLE "JournalPosting"
  ADD CONSTRAINT "JournalPosting_amount_non_zero" CHECK ("signedAmountMinor" <> 0);
ALTER TABLE "JournalPosting"
  ADD CONSTRAINT "JournalPosting_line_number_positive" CHECK ("lineNumber" > 0);

-- Payment source and payer are mutually exclusive: money came out of a book
-- account, or an associate advanced personal funds. Never both, never neither.
ALTER TABLE "ExpensePayment"
  ADD CONSTRAINT "ExpensePayment_valid_source" CHECK (
    (
      "sourceType" = 'BOOK_ACCOUNT'
      AND "sourceAccountId" IS NOT NULL
      AND "payerAssociateId" IS NULL
    )
    OR
    (
      "sourceType" = 'ASSOCIATE_PERSONAL_FUNDS'
      AND "sourceAccountId" IS NULL
      AND "payerAssociateId" IS NOT NULL
    )
  );

-- A common benefit belongs to nobody in particular; a specific benefit always
-- names its beneficiary.
ALTER TABLE "EconomicAllocation"
  ADD CONSTRAINT "EconomicAllocation_valid_associate" CHECK (
    (
      "type" = 'COMMON'
      AND "associateId" IS NULL
    )
    OR
    (
      "type" = 'ASSOCIATE_SPECIFIC'
      AND "associateId" IS NOT NULL
    )
  );

-- Ownership shares are basis points of a whole book.
ALTER TABLE "FinanceBookMember"
  ADD CONSTRAINT "FinanceBookMember_share_range" CHECK (
    "shareBasisPoints" > 0 AND "shareBasisPoints" <= 10000
  );
ALTER TABLE "SettlementShareSnapshot"
  ADD CONSTRAINT "SettlementShareSnapshot_share_range" CHECK (
    "shareBasisPoints" > 0 AND "shareBasisPoints" <= 10000
  );
ALTER TABLE "FinanceBookMember"
  ADD CONSTRAINT "FinanceBookMember_validity_range" CHECK (
    "validUntil" IS NULL OR "validUntil" > "validFrom"
  );

-- Moving money to where it already is, or settling with yourself, is a no-op
-- that would silently corrupt balances.
ALTER TABLE "MoneyTransfer"
  ADD CONSTRAINT "MoneyTransfer_distinct_accounts" CHECK ("fromAccountId" <> "toAccountId");
ALTER TABLE "SettlementTransfer"
  ADD CONSTRAINT "SettlementTransfer_distinct_associates" CHECK ("fromAssociateId" <> "toAssociateId");

-- Settlement periods are half-open: [periodStart, periodEnd).
ALTER TABLE "SettlementRun"
  ADD CONSTRAINT "SettlementRun_period_ordered" CHECK ("periodStart" < "periodEnd");

-- An account's role fixes its accounting category, which in turn fixes the
-- sign convention the posting engine applies (finance spec §6).
ALTER TABLE "LedgerAccount"
  ADD CONSTRAINT "LedgerAccount_role_category_valid" CHECK (
    (
      "role" IN (
        'BANK',
        'CASH_REGISTER',
        'COMPANY_CASH_CUSTODY',
        'ASSOCIATE_POOL_CASH_CUSTODY',
        'RECEIVABLE_FROM_ASSOCIATE',
        'FIXED_ASSET'
      )
      AND "category" = 'ASSET'
    )
    OR
    (
      "role" IN ('PAYABLE_TO_ASSOCIATE', 'ASSOCIATE_LOAN_PAYABLE')
      AND "category" = 'LIABILITY'
    )
    OR
    (
      "role" IN (
        'OPERATING_EXPENSE',
        'NON_OPERATIONAL_COMPANY_EXPENSE',
        'ASSOCIATE_POOL_EXPENSE'
      )
      AND "category" = 'EXPENSE'
    )
    OR
    (
      "role" IN ('RENTAL_REVENUE', 'SCOOTER_SALE_REVENUE', 'ASSOCIATE_POOL_REVENUE')
      AND "category" = 'REVENUE'
    )
  );

-- Associate-scoped roles name their associate; everything else must not, so
-- the account resolver can rely on (book, role, associate) being unambiguous.
ALTER TABLE "LedgerAccount"
  ADD CONSTRAINT "LedgerAccount_associate_scope_valid" CHECK (
    CASE
      WHEN "role" IN (
        'COMPANY_CASH_CUSTODY',
        'ASSOCIATE_POOL_CASH_CUSTODY',
        'PAYABLE_TO_ASSOCIATE',
        'RECEIVABLE_FROM_ASSOCIATE',
        'ASSOCIATE_LOAN_PAYABLE'
      ) THEN "associateId" IS NOT NULL
      ELSE "associateId" IS NULL
    END
  );

-- Only a REVERSAL points at the operation it undoes.
ALTER TABLE "FinancialOperation"
  ADD CONSTRAINT "FinancialOperation_reversal_link_valid" CHECK (
    CASE
      WHEN "kind" = 'REVERSAL' THEN "reversalOfOperationId" IS NOT NULL
      ELSE "reversalOfOperationId" IS NULL
    END
  );

-- A posted operation carries its posting timestamp; a draft cannot.
ALTER TABLE "FinancialOperation"
  ADD CONSTRAINT "FinancialOperation_posted_at_valid" CHECK (
    CASE
      WHEN "status" = 'DRAFT' THEN "postedAt" IS NULL
      ELSE "postedAt" IS NOT NULL
    END
  );

-- Posted ledger lines are never rewritten. Corrections go through a REVERSAL
-- operation whose postings are the exact inverse (finance spec §2.6).
-- DELETE stays permitted so test fixtures and the seed can tear data down;
-- application code never deletes a posted entry.
CREATE OR REPLACE FUNCTION "finance_reject_journal_update"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Journal records are immutable. Post a REVERSAL operation instead of updating %.',
    TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JournalEntry_immutable_trigger"
  BEFORE UPDATE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION "finance_reject_journal_update"();

CREATE TRIGGER "JournalPosting_immutable_trigger"
  BEFORE UPDATE ON "JournalPosting"
  FOR EACH ROW EXECUTE FUNCTION "finance_reject_journal_update"();
