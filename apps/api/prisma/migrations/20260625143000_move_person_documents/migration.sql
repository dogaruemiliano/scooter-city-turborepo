-- CreateTable
CREATE TABLE "PersonDocument" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT,
    "issuingCountryCode" TEXT,
    "expiresOn" DATE,
    "status" TEXT NOT NULL DEFAULT 'unverified',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersonDocument_pkey" PRIMARY KEY ("id")
);

-- Preserve document data from the previous single-document Person columns.
INSERT INTO "PersonDocument" (
    "id",
    "personId",
    "type",
    "number",
    "issuingCountryCode",
    "expiresOn",
    "status",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy_person_document_' || md5("id"),
    "id",
    COALESCE("documentType", 'other'),
    "documentNumber",
    "documentIssuingCountryCode",
    "documentExpiresOn",
    "documentStatus",
    "createdAt",
    "updatedAt"
FROM "Person"
WHERE
    "documentType" IS NOT NULL
    OR "documentNumber" IS NOT NULL
    OR "documentIssuingCountryCode" IS NOT NULL
    OR "documentExpiresOn" IS NOT NULL
    OR "documentStatus" <> 'unverified';

-- DropIndex
DROP INDEX "Person_documentStatus_idx";

-- AlterTable
ALTER TABLE "Person"
DROP COLUMN "documentType",
DROP COLUMN "documentNumber",
DROP COLUMN "documentIssuingCountryCode",
DROP COLUMN "documentExpiresOn",
DROP COLUMN "documentStatus";

-- CreateIndex
CREATE INDEX "PersonDocument_personId_deletedAt_idx" ON "PersonDocument"("personId", "deletedAt");

-- CreateIndex
CREATE INDEX "PersonDocument_type_idx" ON "PersonDocument"("type");

-- CreateIndex
CREATE INDEX "PersonDocument_status_idx" ON "PersonDocument"("status");

-- CreateIndex
CREATE INDEX "PersonDocument_expiresOn_idx" ON "PersonDocument"("expiresOn");

-- AddForeignKey
ALTER TABLE "PersonDocument" ADD CONSTRAINT "PersonDocument_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
