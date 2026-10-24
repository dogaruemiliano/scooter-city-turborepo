ALTER TABLE "User" ADD COLUMN "avatarAssetId" TEXT;
CREATE UNIQUE INDEX "User_avatarAssetId_key" ON "User"("avatarAssetId");
ALTER TABLE "User" ADD CONSTRAINT "User_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
