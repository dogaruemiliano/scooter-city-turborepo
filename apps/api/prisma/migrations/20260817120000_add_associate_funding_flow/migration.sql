-- Associate funding can either create a repayable loan or increase equity.
ALTER TYPE "AssociateFundingType" ADD VALUE 'CAPITAL_CONTRIBUTION';
ALTER TYPE "LedgerAccountRole" ADD VALUE 'CONTRIBUTED_CAPITAL';

ALTER TABLE "AssociateFunding"
  ADD COLUMN "reference" TEXT,
  ADD COLUMN "notes" TEXT;

ALTER TABLE "LedgerAccount"
  DROP CONSTRAINT "LedgerAccount_role_category_valid";

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
      "role" = 'CONTRIBUTED_CAPITAL'
      AND "category" = 'EQUITY'
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
