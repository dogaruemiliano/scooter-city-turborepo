/**
 * In-app finance paths, unlocalized. Wrap with `localizePath` at the call
 * site — these are the route shapes, not hrefs.
 */
export const FINANCE_PATHS = {
  overview: "/finance",
  expenses: "/finance/expenses",
  newExpense: "/finance/expenses/new",
  newFunding: "/finance/funding/new",
  operations: "/finance/operations",
  operation: (operationId: string): string =>
    `/finance/operations/${encodeURIComponent(operationId)}`,
  accounts: "/finance/accounts",
  settlement: "/finance/settlement",
} as const;
