-- Removes the financial module ahead of a ground-up rebuild.
--
-- Written defensively (IF EXISTS / CASCADE) because the dev database had
-- drifted from migration history: some foreign keys recorded in
-- 20260801120000_add_expense_workflow were absent from the live database.

-- Trigger on a surviving table; the rest ride along with their dropped tables.
DROP TRIGGER IF EXISTS "MediaAsset_expense_evidence_immutability_trigger" ON "MediaAsset";

-- Dropping the column also removes its unique constraint and foreign key.
ALTER TABLE "Scooter" DROP COLUMN IF EXISTS "purchaseAllocationId";

-- DropTable
DROP TABLE IF EXISTS "ExpensePosting" CASCADE;
DROP TABLE IF EXISTS "ExpenseReimbursementSettlement" CASCADE;
DROP TABLE IF EXISTS "ExpenseReimbursementClaim" CASCADE;
DROP TABLE IF EXISTS "ExpenseDocumentAsset" CASCADE;
DROP TABLE IF EXISTS "ExpenseDocument" CASCADE;
DROP TABLE IF EXISTS "ExpenseReference" CASCADE;
DROP TABLE IF EXISTS "ExpenseScooterAllocation" CASCADE;
DROP TABLE IF EXISTS "ExpenseTaxLine" CASCADE;
DROP TABLE IF EXISTS "ExpenseTaxSnapshot" CASCADE;
DROP TABLE IF EXISTS "ExpenseCostAttribution" CASCADE;
DROP TABLE IF EXISTS "ExpenseCostPool" CASCADE;
DROP TABLE IF EXISTS "ExpensePayment" CASCADE;
DROP TABLE IF EXISTS "Expense" CASCADE;
DROP TABLE IF EXISTS "VatRegistrationPeriod" CASCADE;
DROP TABLE IF EXISTS "BusinessOwner" CASCADE;
DROP TABLE IF EXISTS "BusinessLegalEntityWallet" CASCADE;
DROP TABLE IF EXISTS "BusinessLegalEntity" CASCADE;
DROP TABLE IF EXISTS "ScooterSaleDocument" CASCADE;
DROP TABLE IF EXISTS "ScooterSale" CASCADE;
DROP TABLE IF EXISTS "MoneyTransactionReference" CASCADE;
DROP TABLE IF EXISTS "WalletBalanceChange" CASCADE;
DROP TABLE IF EXISTS "MoneyTransaction" CASCADE;
DROP TABLE IF EXISTS "WalletBalance" CASCADE;
DROP TABLE IF EXISTS "Wallet" CASCADE;
DROP TABLE IF EXISTS "FinancialCategory" CASCADE;
DROP TABLE IF EXISTS "Counterparty" CASCADE;
DROP TABLE IF EXISTS "Company" CASCADE;

-- DropFunction
DROP FUNCTION IF EXISTS validate_expense_consistency() CASCADE;
DROP FUNCTION IF EXISTS validate_business_legal_entity_wallet_assignment() CASCADE;
DROP FUNCTION IF EXISTS validate_business_legal_entity_tax_identifier() CASCADE;
DROP FUNCTION IF EXISTS protect_referenced_expense_wallet_type() CASCADE;
DROP FUNCTION IF EXISTS protect_posted_business_owner_history() CASCADE;
DROP FUNCTION IF EXISTS protect_posted_expense_vat_history() CASCADE;
DROP FUNCTION IF EXISTS protect_locked_expense_core_facts() CASCADE;
DROP FUNCTION IF EXISTS protect_locked_expense_evidence_and_tax() CASCADE;
DROP FUNCTION IF EXISTS protect_linked_expense_media_asset() CASCADE;
DROP FUNCTION IF EXISTS protect_expense_document_asset_mutability() CASCADE;
DROP FUNCTION IF EXISTS protect_expense_relationship_identity() CASCADE;
DROP FUNCTION IF EXISTS protect_expense_linked_wallet_balance_change() CASCADE;
DROP FUNCTION IF EXISTS protect_expense_linked_transaction_reference() CASCADE;
DROP FUNCTION IF EXISTS protect_expense_linked_money_transaction() CASCADE;
DROP FUNCTION IF EXISTS synchronize_company_tax_identifier() CASCADE;
DROP FUNCTION IF EXISTS normalize_ro_tax_identifier(text) CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "BillingStatus";
DROP TYPE IF EXISTS "CompanyLegalForm";
DROP TYPE IF EXISTS "CounterpartyType";
DROP TYPE IF EXISTS "ExpenseAttributionTarget";
DROP TYPE IF EXISTS "ExpenseBuyerCuiStatus";
DROP TYPE IF EXISTS "ExpenseDocumentAssetRole";
DROP TYPE IF EXISTS "ExpenseDocumentReviewStatus";
DROP TYPE IF EXISTS "ExpenseDocumentType";
DROP TYPE IF EXISTS "ExpenseFundingTreatment";
DROP TYPE IF EXISTS "ExpensePaymentSource";
DROP TYPE IF EXISTS "ExpensePostingRole";
DROP TYPE IF EXISTS "ExpenseReimbursementStatus";
DROP TYPE IF EXISTS "ExpenseStatus";
DROP TYPE IF EXISTS "FinancialCategoryKind";
DROP TYPE IF EXISTS "MoneyTransactionScope";
DROP TYPE IF EXISTS "MoneyTransactionStatus";
DROP TYPE IF EXISTS "MoneyTransactionType";
DROP TYPE IF EXISTS "PaymentMethod";
DROP TYPE IF EXISTS "ScooterSaleStatus";
DROP TYPE IF EXISTS "WalletBalanceBucket";
DROP TYPE IF EXISTS "WalletType";

-- CreateIndex
DROP INDEX IF EXISTS "person_document_active_identity_unique";
CREATE UNIQUE INDEX "person_document_active_identity_unique" ON "PersonDocument"("personId") WHERE ("deletedAt" IS NULL AND "type" IN ('passport', 'nationalId', 'residencePermit', 'other'));
