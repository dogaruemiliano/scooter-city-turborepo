import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";
import { resolveRouteLocale } from "@/i18n/paths";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinanceSuperAdmin,
} from "../_lib/finance-server";
import { FINANCE_PATHS } from "../_lib/links";
import { FinanceBooksSettings } from "./_components/FinanceBooksSettings";

interface FinanceSettingsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: FinanceSettingsPageProps): Promise<Metadata> {
  const locale = resolveRouteLocale((await params).locale);
  return { title: messages[locale].finance.configuration.title };
}

export default async function FinanceSettingsPage({
  params,
}: FinanceSettingsPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  await requireFinanceSuperAdmin(locale, FINANCE_PATHS.settings);
  const books = await fetchFinance(
    locale,
    FINANCE_PATHS.settings,
    v1.finance.ROUTES.books,
    v1.finance.financeBookListSchema,
    await financeCookieHeader(),
  );
  return <FinanceBooksSettings initialBooks={books.items} />;
}
