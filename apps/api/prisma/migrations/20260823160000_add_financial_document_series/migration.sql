ALTER TABLE "FinancialDocument"
ADD COLUMN "documentSeries" TEXT;

ALTER TABLE "FinancialDocument"
ADD CONSTRAINT "FinancialDocument_series_invoice_only"
CHECK ("documentSeries" IS NULL OR "type" = 'INVOICE');
