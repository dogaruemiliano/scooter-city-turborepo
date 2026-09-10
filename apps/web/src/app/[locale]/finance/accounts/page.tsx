import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { resolveRouteLocale } from "@/i18n/paths";
import { AccountBalanceTable } from "../_components/AccountBalanceTable";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinanceAdmin,
} from "../_lib/finance-server";
import { FINANCE_PATHS } from "../_lib/links";

interface AccountsRoutePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: AccountsRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return { title: messages[locale].appShell.pages.financeAccounts };
}

export default async function AccountsRoutePage({
  params,
}: AccountsRoutePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const path = FINANCE_PATHS.accounts;

  await requireFinanceAdmin(locale, path);
  const cookieHeader = await financeCookieHeader();

  const [books, balances] = await Promise.all([
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
  ]);

  const currency =
    books.items.find((book) => book.type === "COMPANY")?.functionalCurrency ??
    "RON";

  return (
    <AccountBalanceTable
      balances={balances.items}
      currency={currency}
      locale={locale}
    />
  );
}
