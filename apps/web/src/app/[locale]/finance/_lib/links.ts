/**
 * In-app finance paths, unlocalized. Wrap with `localizePath` at the call
 * site — these are the route shapes, not hrefs.
 */
export const FINANCE_PATHS = {
  overview: "/finance",
  expenses: "/finance/expenses",
  newExpense: "/finance/expenses/new",
  newExpenseManual: "/finance/expenses/new/manual",
  expenseExtraction: (draftId: string): string =>
    `/finance/expenses/extractions/${encodeURIComponent(draftId)}`,
  newFunding: "/finance/funding/new",
  operations: "/finance/operations",
  operation: (operationId: string): string =>
    `/finance/operations/${encodeURIComponent(operationId)}`,
  accounts: "/finance/accounts",
  settlement: "/finance/settlement",
  settings: "/finance/settings",
} as const;
