ALTER TABLE "SigningInvitation"
  ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "deliveryNextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "sentAt" TIMESTAMP(3);
CREATE INDEX "SigningInvitation_deliveryStatus_deliveryNextRunAt_idx" ON "SigningInvitation"("deliveryStatus", "deliveryNextRunAt");
