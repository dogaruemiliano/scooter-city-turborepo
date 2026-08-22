import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { Button, Card } from "@repo/ui/components";
import type { Metadata } from "next";

import { Link } from "@/i18n/navigation";
import { resolveRouteLocale } from "@/i18n/paths";
import { formatMinorAmount } from "@/lib/finance-format";
import { OperationList } from "./_components/OperationList";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinanceAdmin,
} from "./_lib/finance-server";
import { FINANCE_PATHS } from "./_lib/links";

const RECENT_OPERATION_COUNT = 8;

interface FinanceRoutePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: FinanceRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return { title: messages[locale].appShell.pages.finance };
}

export default async function FinanceRoutePage({
  params,
}: FinanceRoutePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const path = FINANCE_PATHS.overview;

  await requireFinanceAdmin(locale, path);
  const cookieHeader = await financeCookieHeader();

  const [books, balances, operations] = await Promise.all([
    fetchFinance(
      locale,
      path,
      v1.finance.ROUTES.books,
      v1.finance.financeBookListSchema,
      cookieHeader,
    ),
    fetchFinance(
      locale,
      path,
      `${v1.finance.ROUTES.accounts.balances}?${new URLSearchParams({
        bookType: "COMPANY",
      })}`,
      v1.finance.ledgerAccountBalanceListSchema,
      cookieHeader,
    ),
    fetchFinance(
      locale,
      path,
      `${v1.finance.ROUTES.operations.list}?${new URLSearchParams({
        bookType: "COMPANY",
        pageSize: String(RECENT_OPERATION_COUNT),
      })}`,
      v1.finance.financialOperationListSchema,
      cookieHeader,
    ),
  ]);

  const t = messages[locale].finance;
  const companyBook = books.items.find((book) => book.type === "COMPANY");
  const currency = companyBook?.functionalCurrency ?? "RON";

  const totalOf = (roles: readonly v1.finance.LedgerAccountRole[]) =>
    balances.items
      .filter((balance) => roles.includes(balance.role))
      .reduce((sum, balance) => sum + balance.displayBalanceMinor, 0);

  const cashMinor = totalOf(["BANK", "CASH_REGISTER", "COMPANY_CASH_CUSTODY"]);
  const owedMinor = totalOf(["PAYABLE_TO_ASSOCIATE", "ASSOCIATE_LOAN_PAYABLE"]);
  const owingMinor = totalOf(["RECEIVABLE_FROM_ASSOCIATE"]);
  const expenseMinor = totalOf([
    "OPERATING_EXPENSE",
    "NON_OPERATIONAL_COMPANY_EXPENSE",
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-medium">{t.overview.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.overview.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button render={<Link href={FINANCE_PATHS.newExpense} />}>
            {t.overview.newExpense}
          </Button>
          <Button
            variant="outline"
            render={<Link href={FINANCE_PATHS.newFunding} />}
          >
            {t.overview.addCompanyMoney}
          </Button>
          <Button
            variant="outline"
            render={<Link href={FINANCE_PATHS.settlement} />}
          >
            {t.overview.viewSettlement}
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          label={t.overview.sections.cash}
          value={formatMinorAmount(cashMinor, currency, locale)}
        />
        <SummaryTile
          label={t.overview.sections.owed}
          value={formatMinorAmount(owedMinor, currency, locale)}
        />
        <SummaryTile
          label={t.overview.sections.owing}
          value={formatMinorAmount(owingMinor, currency, locale)}
        />
        <SummaryTile
          label={t.overview.sections.results}
          value={formatMinorAmount(expenseMinor, currency, locale)}
        />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium">{t.operations.title}</h2>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={FINANCE_PATHS.operations} />}
          >
            {t.overview.viewOperations}
          </Button>
        </div>

        <OperationList
          items={operations.items}
          currency={currency}
          locale={locale}
          emptyLabel={t.overview.empty}
        />
      </section>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xl font-medium tabular-nums">{value}</p>
    </Card>
  );
}
