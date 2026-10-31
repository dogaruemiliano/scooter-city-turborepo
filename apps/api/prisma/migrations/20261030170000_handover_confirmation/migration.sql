ALTER TABLE "Rental"
  ADD COLUMN "handoverRecipientPersonId" TEXT,
  ADD COLUMN "handoverConfirmedByUserId" TEXT,
  ADD COLUMN "handoverOriginalIdentityCheckedAt" TIMESTAMP(3);
