CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "taxIdentifier" TEXT NOT NULL,
  "normalizedTaxIdentifier" TEXT NOT NULL,
  "isVatPayer" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_normalizedName_key"
  ON "Supplier"("normalizedName");
CREATE UNIQUE INDEX "Supplier_normalizedTaxIdentifier_key"
  ON "Supplier"("normalizedTaxIdentifier");
CREATE INDEX "Supplier_isActive_name_idx"
  ON "Supplier"("isActive", "name");

ALTER TABLE "Expense"
  ADD COLUMN "supplierId" TEXT;

CREATE INDEX "Expense_supplierId_idx"
  ON "Expense"("supplierId");

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
