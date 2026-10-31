ALTER TABLE "ContractRetentionItem"
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "providerDeletedAt" TIMESTAMP(3);
