import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { resolveRouteLocale } from "@/i18n/paths";
import { FinancialOperationDetails } from "../../_components/FinancialOperationDetails";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinanceAdmin,
} from "../../_lib/finance-server";
import { FINANCE_PATHS } from "../../_lib/links";

interface OperationRoutePageProps {
  params: Promise<{ locale: string; operationId: string }>;
}

export async function generateMetadata({
  params,
}: OperationRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return { title: messages[locale].appShell.pages.financeOperation };
}

export default async function OperationRoutePage({
  params,
}: OperationRoutePageProps) {
  const { locale: rawLocale, operationId } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const path = FINANCE_PATHS.operation(operationId);

  await requireFinanceAdmin(locale, path);
  const cookieHeader = await financeCookieHeader();

  const [operation, books] = await Promise.all([
    fetchFinance(
      locale,
      path,
      v1.finance.ROUTES.operations.get(operationId),
      v1.finance.financialOperationSchema,
      cookieHeader,
    ),
    fetchFinance(
      locale,
      path,
      v1.finance.ROUTES.books,
      v1.finance.financeBookListSchema,
      cookieHeader,
    ),
  ]);

  const currency =
    books.items.find((book) => book.id === operation.bookId)
      ?.functionalCurrency ?? "RON";

  return (
    <FinancialOperationDetails operation={operation} currency={currency} />
  );
}
