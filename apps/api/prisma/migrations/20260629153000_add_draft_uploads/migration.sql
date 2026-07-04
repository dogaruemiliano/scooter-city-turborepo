-- CreateTable
CREATE TABLE "DraftUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftUpload_storageKey_key" ON "DraftUpload"("storageKey");

-- CreateIndex
CREATE INDEX "DraftUpload_userId_purpose_claimedAt_expiresAt_idx" ON "DraftUpload"("userId", "purpose", "claimedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "DraftUpload_claimedAt_expiresAt_idx" ON "DraftUpload"("claimedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "DraftUpload_purpose_expiresAt_idx" ON "DraftUpload"("purpose", "expiresAt");

-- AddForeignKey
ALTER TABLE "DraftUpload" ADD CONSTRAINT "DraftUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
