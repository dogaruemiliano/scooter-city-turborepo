import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { Button } from "@repo/ui/components";
import type { Metadata } from "next";

import { Link } from "@/i18n/navigation";
import { resolveRouteLocale } from "@/i18n/paths";
import { OperationList } from "../_components/OperationList";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinanceAdmin,
} from "../_lib/finance-server";
import { FINANCE_PATHS } from "../_lib/links";

const PAGE_SIZE = 25;

interface ExpensesRoutePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ExpensesRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return { title: messages[locale].appShell.pages.financeExpenses };
}

export default async function ExpensesRoutePage({
  params,
}: ExpensesRoutePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const path = FINANCE_PATHS.expenses;

  await requireFinanceAdmin(locale, path);
  const cookieHeader = await financeCookieHeader();

  const [books, operations] = await Promise.all([
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
      `${v1.finance.ROUTES.operations.list}?${new URLSearchParams({
        kind: "EXPENSE",
        pageSize: String(PAGE_SIZE),
      })}`,
      v1.finance.financialOperationListSchema,
      cookieHeader,
    ),
  ]);

  const t = messages[locale].finance;
  const currency =
    books.items.find((book) => book.type === "COMPANY")?.functionalCurrency ??
    "RON";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-medium">{t.expense.listTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {t.expense.listDescription}
          </p>
        </div>

        <Button render={<Link href={FINANCE_PATHS.newExpense} />}>
          {t.overview.newExpense}
        </Button>
      </header>

      <OperationList
        items={operations.items}
        currency={currency}
        locale={locale}
        emptyLabel={t.operations.empty}
      />
    </div>
  );
}
