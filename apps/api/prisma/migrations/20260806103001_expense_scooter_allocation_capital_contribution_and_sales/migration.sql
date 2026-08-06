-- CreateEnum
CREATE TYPE "ScooterSaleStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- AlterEnum
ALTER TYPE "MoneyTransactionType" ADD VALUE 'CAPITAL_CONTRIBUTION';

-- AlterTable
ALTER TABLE "Expense" ALTER COLUMN "payeeId" DROP NOT NULL,
ALTER COLUMN "categoryId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "FinancialCategory" ADD COLUMN     "icon" TEXT;

-- CreateTable
CREATE TABLE "ExpenseScooterAllocation" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "scooterId" TEXT NOT NULL,
    "allocatedGrossAmount" DECIMAL(19,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseScooterAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScooterSale" (
    "id" TEXT NOT NULL,
    "scooterId" TEXT NOT NULL,
    "buyerCounterpartyId" TEXT NOT NULL,
    "saleAmount" DECIMAL(19,2) NOT NULL,
    "paidAmount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'RON',
    "status" "ScooterSaleStatus" NOT NULL DEFAULT 'OPEN',
    "soldOn" DATE NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScooterSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseScooterAllocation_scooterId_idx" ON "ExpenseScooterAllocation"("scooterId");

-- CreateIndex
CREATE INDEX "ExpenseScooterAllocation_expenseId_idx" ON "ExpenseScooterAllocation"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseScooterAllocation_expenseId_scooterId_key" ON "ExpenseScooterAllocation"("expenseId", "scooterId");

-- CreateIndex
CREATE UNIQUE INDEX "ScooterSale_scooterId_key" ON "ScooterSale"("scooterId");

-- CreateIndex
CREATE INDEX "ScooterSale_buyerCounterpartyId_status_idx" ON "ScooterSale"("buyerCounterpartyId", "status");

-- AddForeignKey
ALTER TABLE "ExpenseScooterAllocation" ADD CONSTRAINT "ExpenseScooterAllocation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseScooterAllocation" ADD CONSTRAINT "ExpenseScooterAllocation_scooterId_fkey" FOREIGN KEY ("scooterId") REFERENCES "Scooter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScooterSale" ADD CONSTRAINT "ScooterSale_scooterId_fkey" FOREIGN KEY ("scooterId") REFERENCES "Scooter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScooterSale" ADD CONSTRAINT "ScooterSale_buyerCounterpartyId_fkey" FOREIGN KEY ("buyerCounterpartyId") REFERENCES "Counterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScooterSale" ADD CONSTRAINT "ScooterSale_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
