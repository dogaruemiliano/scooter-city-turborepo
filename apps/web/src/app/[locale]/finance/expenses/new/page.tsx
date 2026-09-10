import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { resolveRouteLocale } from "@/i18n/paths";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinanceAdmin,
} from "../../_lib/finance-server";
import { FINANCE_PATHS } from "../../_lib/links";
import { ExpenseReceiptCapture } from "../_components/ExpenseReceiptCapture";

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

  const currentUser = await requireFinanceAdmin(locale, path);
  const cookieHeader = await financeCookieHeader();
  const [books, accounts, categories, costObjects, suppliers] =
    await Promise.all([
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
      fetchFinance(
        locale,
        path,
        v1.finance.ROUTES.suppliers.list,
        v1.finance.supplierListSchema,
        cookieHeader,
      ),
    ]);

  return (
    <ExpenseReceiptCapture
      books={books.items}
      accounts={accounts.items}
      categories={categories.items}
      costObjects={costObjects.items}
      suppliers={suppliers.items}
      currentUserId={currentUser.id}
    />
  );
}
