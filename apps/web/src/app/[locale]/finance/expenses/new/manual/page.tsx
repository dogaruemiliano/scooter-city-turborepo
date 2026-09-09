import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinanceAdmin,
} from "../../../_lib/finance-server";
import { FINANCE_PATHS } from "../../../_lib/links";
import { ExpenseForm } from "../../_components/ExpenseForm";
import {
  expenseFormDefaultsFromExtraction,
  isExpenseFormFocusField,
  todayDateOnly,
} from "../../_lib/expense-form";

interface ManualExpenseRoutePageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ draft?: string; focus?: string }>;
}

export async function generateMetadata({
  params,
}: ManualExpenseRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  return { title: messages[locale].appShell.pages.newFinanceExpenseManual };
}

export default async function ManualExpenseRoutePage({
  params,
  searchParams,
}: ManualExpenseRoutePageProps) {
  const { locale: rawLocale } = await params;
  const { draft: draftId, focus } = await searchParams;
  const locale = resolveRouteLocale(rawLocale);
  const path = FINANCE_PATHS.newExpenseManual;

  const currentUser = await requireFinanceAdmin(locale, path);
  const cookieHeader = await financeCookieHeader();
  const [books, accounts, categories, costObjects, suppliers, extractionDraft] =
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
      draftId
        ? fetchFinance(
            locale,
            path,
            v1.finance.ROUTES.expenses.extraction(draftId),
            v1.finance.expenseExtractionDraftSchema,
            cookieHeader,
          )
        : Promise.resolve(null),
    ]);
  const companyBook =
    books.items.find((book) => book.type === "COMPANY") ?? books.items[0];
  const receiptFallbackBook =
    books.items.find((book) => book.type === "ASSOCIATE_POOL") ?? companyBook;

  if (!companyBook) {
    throw new Error(
      "No finance book exists. Run the finance seed to create the company and associate-pool books.",
    );
  }

  return (
    <ExpenseForm
      book={companyBook}
      books={books.items}
      accounts={accounts.items}
      categories={categories.items}
      costObjects={costObjects.items}
      expensesHref={localizePath(FINANCE_PATHS.expenses, locale)}
      initialValues={
        extractionDraft?.status === "READY" && extractionDraft.result
          ? expenseFormDefaultsFromExtraction({
              extraction: extractionDraft.result,
              books: books.items,
              accounts: accounts.items,
              categories: categories.items,
              suppliers: suppliers.items,
              currentUserId: currentUser.id,
              fallbackBook: receiptFallbackBook,
              today: todayDateOnly(),
            })
          : undefined
      }
      extractionDraftId={
        extractionDraft?.status === "READY" ? extractionDraft.id : undefined
      }
      initialFocusField={isExpenseFormFocusField(focus) ? focus : undefined}
    />
  );
}
