ALTER TABLE "DraftUpload"
  ADD COLUMN "cleanupStartedAt" TIMESTAMP(3);

CREATE INDEX "DraftUpload_claimedAt_cleanupStartedAt_expiresAt_idx"
  ON "DraftUpload"("claimedAt", "cleanupStartedAt", "expiresAt");
