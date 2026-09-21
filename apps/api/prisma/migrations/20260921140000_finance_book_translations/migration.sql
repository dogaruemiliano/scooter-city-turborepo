-- Preserve existing names as the required Romanian fallback.
ALTER TABLE "FinanceBook" ADD COLUMN "nameTranslations" JSONB NOT NULL DEFAULT '{}';
