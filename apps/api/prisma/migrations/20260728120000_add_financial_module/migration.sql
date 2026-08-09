-- Financial tracking enums.
CREATE TYPE "WalletType" AS ENUM (
  'USER',
  'COMPANY_CASH',
  'COMPANY_BANK',
  'PAYMENT_PROCESSOR'
);

CREATE TYPE "WalletBalanceBucket" AS ENUM (
  'USER_SETTLEMENT',
  'BUSINESS_FUNDS',
  'ADMIN_PERSONAL_FUNDS',
  'CUSTOMER_GUARANTEE_FUNDS'
);

CREATE TYPE "MoneyTransactionType" AS ENUM (
  'INCOME',
  'EXPENSE',
  'TRANSFER',
  'USER_CHARGE',
  'USER_PAYMENT',
  'GUARANTEE_RECEIVED',
  'GUARANTEE_REFUNDED',
  'REIMBURSEMENT',
  'PERSONAL_EXTRACTION',
  'PERSONAL_FUNDS_SPLIT',
  'PERSONAL_FUNDS_CLAIM',
  'COMPANY_DISTRIBUTION',
  'REFUND',
  'ADJUSTMENT',
  'REVERSAL'
);

CREATE TYPE "MoneyTransactionStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

CREATE TYPE "MoneyTransactionScope" AS ENUM (
  'COMPANY',
  'ADMIN_PERSONAL',
  'CUSTOMER_HELD'
);

CREATE TYPE "PaymentMethod" AS ENUM (
  'CASH',
  'POS',
  'BANK_TRANSFER',
  'ONLINE_PAYMENT'
);

CREATE TYPE "BillingStatus" AS ENUM (
  'BILLED',
  'NOT_BILLED',
  'NOT_APPLICABLE'
);

CREATE TYPE "FinancialCategoryKind" AS ENUM ('INCOME', 'EXPENSE', 'BOTH');

-- Every Person is backed by exactly one User. Add the relation as nullable,
-- link existing records, create missing users, then enforce the invariant.
ALTER TABLE "Person" ADD COLUMN "userId" TEXT;

UPDATE "Person" AS person
SET "userId" = app_user."id"
FROM "User" AS app_user
WHERE person."userId" IS NULL
  AND app_user."email" = person."email"
  AND NOT EXISTS (
    SELECT 1
    FROM "Person" AS linked_person
    WHERE linked_person."userId" = app_user."id"
  );

UPDATE "Person" AS person
SET "userId" = app_user."id"
FROM "User" AS app_user
WHERE person."userId" IS NULL
  AND app_user."phone" = person."phone"
  AND NOT EXISTS (
    SELECT 1
    FROM "Person" AS linked_person
    WHERE linked_person."userId" = app_user."id"
  );

INSERT INTO "User" (
  "id",
  "email",
  "phone",
  "firstName",
  "lastName",
  "roles",
  "createdAt",
  "updatedAt"
)
SELECT
  'personuser_' || md5(person."id"),
  person."email",
  CASE
    WHEN EXISTS (
      SELECT 1 FROM "User" AS app_user WHERE app_user."phone" = person."phone"
    ) THEN NULL
    ELSE person."phone"
  END,
  person."firstName",
  person."lastName",
  ARRAY[]::TEXT[],
  person."createdAt",
  CURRENT_TIMESTAMP
FROM "Person" AS person
WHERE person."userId" IS NULL;

UPDATE "Person" AS person
SET "userId" = 'personuser_' || md5(person."id")
WHERE person."userId" IS NULL;

ALTER TABLE "Person" ALTER COLUMN "userId" SET NOT NULL;
CREATE UNIQUE INDEX "Person_userId_key" ON "Person"("userId");

-- Wallets are money locations. A USER wallet is unique per owner; company
-- wallets have no owner and can have multiple named cash/bank locations.
CREATE TABLE "Wallet" (
  "id" TEXT NOT NULL,
  "type" "WalletType" NOT NULL,
  "ownerUserId" TEXT,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletBalance" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "bucket" "WalletBalanceBucket" NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'RON',
  "balance" DECIMAL(19,2) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WalletBalance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletBalance_currency_check"
    CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "FinancialCategory" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "FinancialCategoryKind" NOT NULL,
  "parentCategoryId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MoneyTransaction" (
  "id" TEXT NOT NULL,
  "type" "MoneyTransactionType" NOT NULL,
  "status" "MoneyTransactionStatus" NOT NULL DEFAULT 'DRAFT',
  "amount" DECIMAL(19,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'RON',
  "financialScope" "MoneyTransactionScope" NOT NULL,
  "paymentMethod" "PaymentMethod",
  "billingStatus" "BillingStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  "categoryId" TEXT,
  "counterpartyUserId" TEXT,
  "recipientUserId" TEXT,
  "debtorUserId" TEXT,
  "creditorUserId" TEXT,
  "recordedByUserId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "description" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "originTransactionId" TEXT,
  "reversalOfTransactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MoneyTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MoneyTransaction_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "MoneyTransaction_currency_check"
    CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "WalletBalanceChange" (
  "id" TEXT NOT NULL,
  "moneyTransactionId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "bucket" "WalletBalanceBucket" NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'RON',
  "amountDelta" DECIMAL(19,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WalletBalanceChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletBalanceChange_amountDelta_check"
    CHECK ("amountDelta" <> 0),
  CONSTRAINT "WalletBalanceChange_currency_check"
    CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "MoneyTransactionReference" (
  "id" TEXT NOT NULL,
  "moneyTransactionId" TEXT NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MoneyTransactionReference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Wallet_ownerUserId_key"
  ON "Wallet"("ownerUserId");
CREATE INDEX "Wallet_type_isActive_idx"
  ON "Wallet"("type", "isActive");

CREATE INDEX "WalletBalance_bucket_currency_idx"
  ON "WalletBalance"("bucket", "currency");
CREATE UNIQUE INDEX "WalletBalance_walletId_bucket_currency_key"
  ON "WalletBalance"("walletId", "bucket", "currency");

CREATE UNIQUE INDEX "FinancialCategory_code_key"
  ON "FinancialCategory"("code");
CREATE INDEX "FinancialCategory_parentCategoryId_idx"
  ON "FinancialCategory"("parentCategoryId");
CREATE INDEX "FinancialCategory_kind_isActive_idx"
  ON "FinancialCategory"("kind", "isActive");

CREATE UNIQUE INDEX "MoneyTransaction_idempotencyKey_key"
  ON "MoneyTransaction"("idempotencyKey");
CREATE INDEX "MoneyTransaction_status_occurredAt_idx"
  ON "MoneyTransaction"("status", "occurredAt");
CREATE INDEX "MoneyTransaction_financialScope_billingStatus_occurredAt_idx"
  ON "MoneyTransaction"("financialScope", "billingStatus", "occurredAt");
CREATE INDEX "MoneyTransaction_paymentMethod_occurredAt_idx"
  ON "MoneyTransaction"("paymentMethod", "occurredAt");
CREATE INDEX "MoneyTransaction_categoryId_occurredAt_idx"
  ON "MoneyTransaction"("categoryId", "occurredAt");
CREATE INDEX "MoneyTransaction_counterpartyUserId_occurredAt_idx"
  ON "MoneyTransaction"("counterpartyUserId", "occurredAt");
CREATE INDEX "MoneyTransaction_recipientUserId_occurredAt_idx"
  ON "MoneyTransaction"("recipientUserId", "occurredAt");
CREATE INDEX "MoneyTransaction_debtorUserId_creditorUserId_occurredAt_idx"
  ON "MoneyTransaction"("debtorUserId", "creditorUserId", "occurredAt");
CREATE INDEX "MoneyTransaction_recordedByUserId_occurredAt_idx"
  ON "MoneyTransaction"("recordedByUserId", "occurredAt");
CREATE INDEX "MoneyTransaction_originTransactionId_idx"
  ON "MoneyTransaction"("originTransactionId");
CREATE INDEX "MoneyTransaction_reversalOfTransactionId_idx"
  ON "MoneyTransaction"("reversalOfTransactionId");

CREATE INDEX "WalletBalanceChange_walletId_bucket_currency_createdAt_idx"
  ON "WalletBalanceChange"("walletId", "bucket", "currency", "createdAt");
CREATE UNIQUE INDEX "WalletBalanceChange_moneyTransactionId_walletId_bucket_curr_key"
  ON "WalletBalanceChange"(
    "moneyTransactionId",
    "walletId",
    "bucket",
    "currency"
  );

CREATE INDEX "MoneyTransactionReference_referenceType_referenceId_idx"
  ON "MoneyTransactionReference"("referenceType", "referenceId");
CREATE INDEX "MoneyTransactionReference_moneyTransactionId_isPrimary_idx"
  ON "MoneyTransactionReference"("moneyTransactionId", "isPrimary");
CREATE UNIQUE INDEX "MoneyTransactionReference_moneyTransactionId_referenceType__key"
  ON "MoneyTransactionReference"(
    "moneyTransactionId",
    "referenceType",
    "referenceId"
  );

ALTER TABLE "Person"
  ADD CONSTRAINT "Person_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Wallet"
  ADD CONSTRAINT "Wallet_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WalletBalance"
  ADD CONSTRAINT "WalletBalance_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialCategory"
  ADD CONSTRAINT "FinancialCategory_parentCategoryId_fkey"
  FOREIGN KEY ("parentCategoryId") REFERENCES "FinancialCategory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MoneyTransaction"
  ADD CONSTRAINT "MoneyTransaction_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MoneyTransaction"
  ADD CONSTRAINT "MoneyTransaction_counterpartyUserId_fkey"
  FOREIGN KEY ("counterpartyUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MoneyTransaction"
  ADD CONSTRAINT "MoneyTransaction_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MoneyTransaction"
  ADD CONSTRAINT "MoneyTransaction_debtorUserId_fkey"
  FOREIGN KEY ("debtorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MoneyTransaction"
  ADD CONSTRAINT "MoneyTransaction_creditorUserId_fkey"
  FOREIGN KEY ("creditorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MoneyTransaction"
  ADD CONSTRAINT "MoneyTransaction_recordedByUserId_fkey"
  FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MoneyTransaction"
  ADD CONSTRAINT "MoneyTransaction_originTransactionId_fkey"
  FOREIGN KEY ("originTransactionId") REFERENCES "MoneyTransaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MoneyTransaction"
  ADD CONSTRAINT "MoneyTransaction_reversalOfTransactionId_fkey"
  FOREIGN KEY ("reversalOfTransactionId") REFERENCES "MoneyTransaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WalletBalanceChange"
  ADD CONSTRAINT "WalletBalanceChange_moneyTransactionId_fkey"
  FOREIGN KEY ("moneyTransactionId") REFERENCES "MoneyTransaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletBalanceChange"
  ADD CONSTRAINT "WalletBalanceChange_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MoneyTransactionReference"
  ADD CONSTRAINT "MoneyTransactionReference_moneyTransactionId_fkey"
  FOREIGN KEY ("moneyTransactionId") REFERENCES "MoneyTransaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing users receive their required one-to-one wallet and a rebuildable
-- settlement-balance cache. New users receive the same records in application
-- code inside the user-creation transaction.
INSERT INTO "Wallet" (
  "id",
  "type",
  "ownerUserId",
  "name",
  "createdAt",
  "updatedAt"
)
SELECT
  'userwallet_' || md5(app_user."id"),
  'USER'::"WalletType",
  app_user."id",
  COALESCE(
    NULLIF(trim(concat_ws(' ', app_user."firstName", app_user."lastName")), ''),
    app_user."email"
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" AS app_user;

INSERT INTO "WalletBalance" (
  "id",
  "walletId",
  "bucket",
  "currency",
  "balance",
  "updatedAt"
)
SELECT
  'walletbalance_' || md5(wallet."id" || ':USER_SETTLEMENT:RON'),
  wallet."id",
  'USER_SETTLEMENT'::"WalletBalanceBucket",
  'RON',
  0,
  CURRENT_TIMESTAMP
FROM "Wallet" AS wallet
WHERE wallet."type" = 'USER';
