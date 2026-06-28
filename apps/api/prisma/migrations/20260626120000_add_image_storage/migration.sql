-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonDocumentPhoto" (
    "id" TEXT NOT NULL,
    "personDocumentId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersonDocumentPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_provider_bucket_idx" ON "MediaAsset"("provider", "bucket");

-- CreateIndex
CREATE INDEX "MediaAsset_uploadedByUserId_idx" ON "MediaAsset"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "MediaAsset_deletedAt_idx" ON "MediaAsset"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonDocumentPhoto_assetId_key" ON "PersonDocumentPhoto"("assetId");

-- CreateIndex
CREATE INDEX "PersonDocumentPhoto_personDocumentId_deletedAt_idx" ON "PersonDocumentPhoto"("personDocumentId", "deletedAt");

-- CreateIndex
CREATE INDEX "PersonDocumentPhoto_slot_idx" ON "PersonDocumentPhoto"("slot");

-- CreateIndex
CREATE UNIQUE INDEX "person_document_photo_active_slot_unique" ON "PersonDocumentPhoto"("personDocumentId", "slot") WHERE "deletedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDocumentPhoto" ADD CONSTRAINT "PersonDocumentPhoto_personDocumentId_fkey" FOREIGN KEY ("personDocumentId") REFERENCES "PersonDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDocumentPhoto" ADD CONSTRAINT "PersonDocumentPhoto_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
