import { randomUUID } from "node:crypto";

import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import {
  financeCookieHeader,
  handleFinanceApiErrors,
  requireFinanceAdmin,
} from "../../_lib/server";
import { ExpenseCreateFlow } from "../_components/ExpenseCreateFlow";
import { expenseToday } from "../_lib/expense-date";
import { loadExpenseFormBootstrap } from "../_lib/expense-server";

const EXPENSES_PATH = "/finance/expenses";
const NEW_EXPENSE_PATH = "/finance/expenses/new";
const BUSINESS_SETTINGS_PATH = "/finance/settings/business";
const CATEGORIES_PATH = "/finance/categories";
const ADVANCED_TRANSACTION_PATH = "/finance/transactions/new";

interface NewExpensePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: NewExpensePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  return { title: messages[locale].finance.expenses.form.title };
}

export default async function NewExpensePage({ params }: NewExpensePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const user = await requireFinanceAdmin(locale, NEW_EXPENSE_PATH);
  const cookieHeader = await financeCookieHeader();
  const today = expenseToday();
  const bootstrap = await handleFinanceApiErrors(locale, NEW_EXPENSE_PATH, () =>
    loadExpenseFormBootstrap({
      cookieHeader,
      currentUserId: user.id,
      today,
    }),
  );

  return (
    <ExpenseCreateFlow
      bootstrap={bootstrap}
      idempotencyKey={`web:expense:create:${randomUUID()}`}
      expensesHref={localizePath(EXPENSES_PATH, locale)}
      categoriesHref={localizePath(CATEGORIES_PATH, locale)}
      settingsHref={localizePath(BUSINESS_SETTINGS_PATH, locale)}
      advancedTransactionHref={localizePath(ADVANCED_TRANSACTION_PATH, locale)}
    />
  );
}
