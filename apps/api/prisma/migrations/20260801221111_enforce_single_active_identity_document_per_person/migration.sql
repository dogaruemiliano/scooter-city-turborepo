/*
  Warnings:

  - A unique constraint covering the columns `[personId]` on the table `PersonDocument` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "person_document_active_identity_unique";

-- CreateIndex
CREATE UNIQUE INDEX "person_document_active_identity_unique" ON "PersonDocument"("personId") WHERE ("deletedAt" IS NULL AND "type" IN ('passport', 'nationalId', 'residencePermit', 'other'));
