-- Supports popularity ranking in counterparty previews without scanning the
-- transaction ledger for every visible person or company.
CREATE INDEX "MoneyTransaction_counterpartyId_type_status_idx"
  ON "MoneyTransaction"("counterpartyId", "type", "status");
