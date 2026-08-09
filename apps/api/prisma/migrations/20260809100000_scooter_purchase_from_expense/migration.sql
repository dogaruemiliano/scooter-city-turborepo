-- Removes the manual Scooter.purchasedOn field. Purchase date and price are
-- now derived from the scooter's linked posted purchase-category expense
-- (ExpensesService sets/clears Scooter.purchaseAllocationId when that
-- expense is posted/reversed). A scooter can point to at most one
-- ExpenseScooterAllocation via the unique FK below.

ALTER TABLE "Scooter" ADD COLUMN "purchaseAllocationId" TEXT;

-- Best-effort backfill: link scooters that already have exactly one posted
-- scooter-purchase expense allocated to them. Scooters with zero or more
-- than one such allocation are left NULL.
UPDATE "Scooter" s
SET "purchaseAllocationId" = esa.id
FROM "ExpenseScooterAllocation" esa
JOIN "Expense" e ON e.id = esa."expenseId"
WHERE esa."scooterId" = s.id
  AND e."categoryId" = 'seed-finance-category-scooter-purchase'
  AND e.status = 'POSTED'
  AND (
    SELECT count(*)
    FROM "ExpenseScooterAllocation" esa2
    JOIN "Expense" e2 ON e2.id = esa2."expenseId"
    WHERE esa2."scooterId" = s.id
      AND e2."categoryId" = 'seed-finance-category-scooter-purchase'
      AND e2.status = 'POSTED'
  ) = 1;

ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_purchaseAllocationId_key" UNIQUE ("purchaseAllocationId");

ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_purchaseAllocationId_fkey" FOREIGN KEY ("purchaseAllocationId") REFERENCES "ExpenseScooterAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "Scooter_purchasedOn_idx";

ALTER TABLE "Scooter" DROP COLUMN "purchasedOn";
