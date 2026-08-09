/*
  Warnings:

  - A unique constraint covering the columns `[personId]` on the table `PersonDocument` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Company_taxIdentifierNormalized_prefix_idx";

-- DropIndex
DROP INDEX "PersonDocument_cnp_prefix_idx";

-- DropIndex
DROP INDEX "person_document_active_identity_unique";

-- CreateIndex
CREATE UNIQUE INDEX "person_document_active_identity_unique" ON "PersonDocument"("personId") WHERE ("deletedAt" IS NULL AND "type" IN ('passport', 'nationalId', 'residencePermit', 'other'));

-- RenameIndex
ALTER INDEX "MoneyTransaction_debtorCounterpartyId_creditorCounterpartyId_oc" RENAME TO "MoneyTransaction_debtorCounterpartyId_creditorCounterpartyI_idx";
