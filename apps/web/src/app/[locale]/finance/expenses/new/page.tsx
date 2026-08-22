import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinanceAdmin,
} from "../../_lib/finance-server";
import { FINANCE_PATHS } from "../../_lib/links";
import { ExpenseForm } from "../_components/ExpenseForm";

interface NewExpenseRoutePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: NewExpenseRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return { title: messages[locale].appShell.pages.newFinanceExpense };
}

export default async function NewExpenseRoutePage({
  params,
}: NewExpenseRoutePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const path = FINANCE_PATHS.newExpense;

  await requireFinanceAdmin(locale, path);
  const cookieHeader = await financeCookieHeader();

  // Everything the form needs to offer real choices: which books exist, which
  // accounts money can come out of, and the expense taxonomy.
  const [books, accounts, categories, costObjects] = await Promise.all([
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
      v1.finance.ROUTES.accounts.list,
      v1.finance.ledgerAccountListSchema,
      cookieHeader,
    ),
    fetchFinance(
      locale,
      path,
      v1.finance.ROUTES.expenseCategories.list,
      v1.finance.expenseCategoryListSchema,
      cookieHeader,
    ),
    fetchFinance(
      locale,
      path,
      v1.finance.ROUTES.costObjects.list,
      v1.finance.costObjectListSchema,
      cookieHeader,
    ),
  ]);

  // The company book is the default; the user can switch to the pool.
  const companyBook =
    books.items.find((book) => book.type === "COMPANY") ?? books.items[0];

  if (!companyBook) {
    throw new Error(
      "No finance book exists. Run the finance seed to create the company and associate-pool books.",
    );
  }

  const t = messages[locale].finance.expense;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-medium">{t.newTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.newDescription}</p>
      </header>

      <ExpenseForm
        book={companyBook}
        books={books.items}
        accounts={accounts.items}
        categories={categories.items}
        costObjects={costObjects.items}
        expensesHref={localizePath(FINANCE_PATHS.expenses, locale)}
      />
    </div>
  );
}
