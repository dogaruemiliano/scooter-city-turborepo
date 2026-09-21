import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { buttonVariants, Card, CardContent } from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { ArrowRight, Plus, Settings } from "lucide-react";
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

  const user = await requireFinanceAdmin(locale, path);
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
        // Inactive custody accounts can still hold company funds.
        includeInactive: "true",
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
    <div className="flex min-w-0 flex-col gap-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {t.overview.title}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t.overview.description}
          </p>
        </div>

        <Link
          href={FINANCE_PATHS.newExpense}
          className={cn(buttonVariants(), "shrink-0 self-start")}
        >
          <Plus aria-hidden="true" data-icon="inline-start" />
          {t.overview.newExpense}
        </Link>
      </header>

      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={FINANCE_PATHS.newFunding}
            className={buttonVariants({ variant: "outline" })}
          >
            {t.overview.addCompanyMoney}
          </Link>
          <Link
            href={FINANCE_PATHS.settlement}
            className={buttonVariants({ variant: "ghost" })}
          >
            {t.overview.viewSettlement}
          </Link>
          {user?.roles.includes(v1.auth.AUTH_ROLES.SUPER_ADMIN) ? (
            <Link
              href={FINANCE_PATHS.settings}
              className={cn(buttonVariants({ variant: "ghost" }), "sm:ml-auto")}
            >
              <Settings aria-hidden="true" data-icon="inline-start" />
              {t.overview.settings}
            </Link>
          ) : null}
        </div>

        <Card className="py-0">
          <CardContent className="p-0">
            <dl className="grid sm:grid-cols-2 xl:grid-cols-4">
              <SummaryBalance
                label={t.overview.sections.cash}
                value={formatMinorAmount(cashMinor, currency, locale)}
              />
              <SummaryBalance
                label={t.overview.sections.owed}
                value={formatMinorAmount(owedMinor, currency, locale)}
              />
              <SummaryBalance
                label={t.overview.sections.owing}
                value={formatMinorAmount(owingMinor, currency, locale)}
              />
              <SummaryBalance
                label={t.overview.sections.results}
                value={formatMinorAmount(expenseMinor, currency, locale)}
              />
            </dl>
          </CardContent>
        </Card>
      </section>

      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t.operations.title}</h2>
          <Link
            href={FINANCE_PATHS.operations}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            {t.overview.viewOperations}
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Link>
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

function SummaryBalance({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-4 border-b p-5 last:border-b-0 sm:p-6 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:not-last:border-r">
      <dt className="text-sm leading-relaxed text-muted-foreground">{label}</dt>
      <dd className="text-2xl leading-tight font-semibold tracking-tight wrap-anywhere tabular-nums">
        {value}
      </dd>
    </div>
  );
}
