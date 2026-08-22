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

  const t = messages[locale].finance.accounts;
  const currency =
    books.items.find((book) => book.type === "COMPANY")?.functionalCurrency ??
    "RON";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-medium">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.description}</p>
      </header>

      <AccountBalanceTable
        balances={balances.items}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
