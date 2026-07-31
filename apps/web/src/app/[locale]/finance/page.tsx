import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { resolveRouteLocale } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import { FinanceOverview } from "./_components/FinanceOverview";
import { resolveFinancePeriod } from "./_lib/period";
import {
  financeCookieHeader,
  handleFinanceApiErrors,
  requireFinanceAdmin,
} from "./_lib/server";

const FINANCE_PATH = "/finance";
const RECENT_TRANSACTION_COUNT = 8;

interface FinancePageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: Pick<FinancePageProps, "params">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return { title: messages[locale].finance.overview.title };
}

export default async function FinancePage({
  params,
  searchParams,
}: FinancePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const period = resolveFinancePeriod(await searchParams);
  await requireFinanceAdmin(locale, FINANCE_PATH);
  const cookieHeader = await financeCookieHeader();

  const [summary, recentTransactions, claims] = await Promise.all([
    handleFinanceApiErrors(locale, FINANCE_PATH, () =>
      webApi.fetch(
        financeSummaryPath(period.query),
        v1.finance.financeSummarySchema,
        {
          headers: { cookie: cookieHeader },
          cache: "no-store",
        },
      ),
    ),
    handleFinanceApiErrors(locale, FINANCE_PATH, () =>
      webApi.fetch(
        recentTransactionsPath(period.query),
        v1.finance.moneyTransactionListSchema,
        {
          headers: { cookie: cookieHeader },
          cache: "no-store",
        },
      ),
    ),
    handleFinanceApiErrors(locale, FINANCE_PATH, () =>
      webApi.fetch(
        v1.finance.ROUTES.claims.outstanding,
        v1.finance.outstandingPersonalClaimListSchema,
        {
          headers: { cookie: cookieHeader },
          cache: "no-store",
        },
      ),
    ),
  ]);

  return (
    <FinanceOverview
      locale={locale}
      period={period}
      summary={summary}
      recentTransactions={recentTransactions}
      claims={claims}
    />
  );
}

function financeSummaryPath(query: v1.finance.FinanceSummaryQuery): string {
  const params = new URLSearchParams({
    from: query.from,
    to: query.to,
  });
  return `${v1.finance.ROUTES.summary}?${params}`;
}

function recentTransactionsPath(
  period: v1.finance.FinanceSummaryQuery,
): string {
  const query = v1.finance.listMoneyTransactionsQuerySchema.parse({
    page: 1,
    pageSize: RECENT_TRANSACTION_COUNT,
    from: period.from,
    to: period.to,
  });
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    from: query.from!,
    to: query.to!,
  });
  return `${v1.finance.ROUTES.transactions.list}?${params}`;
}
