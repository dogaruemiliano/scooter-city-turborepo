ALTER TYPE "ScooterDocumentType" ADD VALUE 'ownership_proof';
ALTER TABLE "ScooterDocument" ADD COLUMN "clientCopyAssetId" TEXT, ADD COLUMN "clientCopyFileName" TEXT;
CREATE UNIQUE INDEX "ScooterDocument_clientCopyAssetId_key" ON "ScooterDocument"("clientCopyAssetId");
ALTER TABLE "ScooterDocument" ADD CONSTRAINT "ScooterDocument_clientCopyAssetId_fkey" FOREIGN KEY ("clientCopyAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
