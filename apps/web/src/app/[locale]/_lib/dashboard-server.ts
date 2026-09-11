import "server-only";

import { ApiError, v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getLocalizedSignInPath, localizePath } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import { meFromApi } from "@/lib/auth-server";

const CASH_ROLES: readonly v1.finance.LedgerAccountRole[] = [
  "BANK",
  "CASH_REGISTER",
  "COMPANY_CASH_CUSTODY",
];
const RECENT_OPERATION_COUNT = 4;

export interface DashboardOverviewData {
  cash: {
    accounts: v1.finance.LedgerAccountBalance[];
    totalMinor: number;
    currency: string;
  } | null;
  operations: {
    items: v1.finance.FinancialOperationListItem[];
    currency: string;
  } | null;
  fleet: v1.maintenance.FleetMaintenanceDashboard | null;
}

/** Gate before starting any administrative request, using the current DB role. */
export async function loadDashboard(locale: SupportedLocale) {
  const user = await meFromApi();

  if (!user) {
    redirect(getLocalizedSignInPath(locale, localizePath("/", locale)));
  }

  if (!user.roles.includes(v1.auth.AUTH_ROLES.ADMIN)) {
    return { user, overview: null };
  }

  const cookieHeader = (await cookies()).toString();

  // Keep the page header and shortcuts available while the overview streams.
  return { user, overview: loadOverview(locale, cookieHeader) };
}

async function loadOverview(
  locale: SupportedLocale,
  cookieHeader: string,
): Promise<DashboardOverviewData> {
  const [books, balances, operations, fleet] = await Promise.all([
    fetchOverviewResource(
      locale,
      cookieHeader,
      v1.finance.ROUTES.books,
      v1.finance.financeBookListSchema,
    ),
    fetchOverviewResource(
      locale,
      cookieHeader,
      // Inactive custody accounts can still hold money after an associate leaves.
      `${v1.finance.ROUTES.accounts.balances}?bookType=COMPANY&includeInactive=true`,
      v1.finance.ledgerAccountBalanceListSchema,
    ),
    fetchOverviewResource(
      locale,
      cookieHeader,
      `${v1.finance.ROUTES.operations.list}?bookType=COMPANY&pageSize=${RECENT_OPERATION_COUNT}`,
      v1.finance.financialOperationListSchema,
    ),
    fetchOverviewResource(
      locale,
      cookieHeader,
      v1.maintenance.ROUTES.dashboard,
      v1.maintenance.fleetMaintenanceDashboardSchema,
    ),
  ]);

  const companyBook = books?.items.find((book) => book.type === "COMPANY");
  const accounts =
    companyBook && balances
      ? balances.items.filter(
          (account) =>
            account.bookId === companyBook.id &&
            CASH_ROLES.includes(account.role),
        )
      : null;

  return {
    cash:
      companyBook && accounts
        ? {
            accounts,
            totalMinor: accounts.reduce(
              (sum, account) => sum + account.displayBalanceMinor,
              0,
            ),
            currency: companyBook.functionalCurrency,
          }
        : null,
    operations:
      companyBook && operations
        ? {
            items: operations.items.filter(
              (item) => item.bookId === companyBook.id,
            ),
            currency: companyBook.functionalCurrency,
          }
        : null,
    fleet,
  };
}

async function fetchOverviewResource<Output>(
  locale: SupportedLocale,
  cookieHeader: string,
  path: string,
  schema: Parameters<typeof webApi.fetch<Output>>[1],
): Promise<Output | null> {
  try {
    return await webApi.fetch(path, schema, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(getLocalizedSignInPath(locale, localizePath("/", locale)));
    }
    if (error instanceof ApiError && error.status === 403) {
      notFound();
    }

    // A failed service must not turn other available summaries into zeroes.
    return null;
  }
}
