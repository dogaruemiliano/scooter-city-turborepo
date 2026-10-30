ALTER TABLE "Rental" ADD COLUMN "conclusionContext" TEXT;
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_conclusion_context_check" CHECK ("conclusionContext" IS NULL OR "conclusionContext" IN ('on_site', 'distance', 'off_premises'));
