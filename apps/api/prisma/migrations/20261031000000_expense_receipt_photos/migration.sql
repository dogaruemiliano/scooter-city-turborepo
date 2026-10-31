ALTER TABLE "ExpenseExtractionDraft" ADD COLUMN "additionalSourceUploadIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
