ALTER TABLE "Wallet"
  ADD COLUMN "cardHolderUserId" TEXT;

CREATE INDEX "Wallet_cardHolderUserId_idx"
  ON "Wallet"("cardHolderUserId");

ALTER TABLE "Wallet"
  ADD CONSTRAINT "Wallet_cardHolderUserId_fkey"
  FOREIGN KEY ("cardHolderUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
