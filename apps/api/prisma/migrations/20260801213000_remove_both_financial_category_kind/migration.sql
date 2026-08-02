-- A category must have one reporting direction. Refuse to guess if a
-- deployment still contains legacy BOTH rows; they must be classified first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "FinancialCategory"
    WHERE "kind"::text = 'BOTH'
  ) THEN
    RAISE EXCEPTION 'Cannot remove FinancialCategoryKind.BOTH while categories still use it';
  END IF;
END
$$;

BEGIN;

CREATE TYPE "FinancialCategoryKind_new" AS ENUM ('INCOME', 'EXPENSE');

ALTER TABLE "FinancialCategory"
  ALTER COLUMN "kind" TYPE "FinancialCategoryKind_new"
  USING ("kind"::text::"FinancialCategoryKind_new");

ALTER TYPE "FinancialCategoryKind" RENAME TO "FinancialCategoryKind_old";
ALTER TYPE "FinancialCategoryKind_new" RENAME TO "FinancialCategoryKind";
DROP TYPE "FinancialCategoryKind_old";

COMMIT;
