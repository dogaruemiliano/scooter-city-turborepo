import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { resolveRouteLocale } from "@/i18n/paths";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinanceAdmin,
} from "../_lib/finance-server";
import { FINANCE_PATHS } from "../_lib/links";
import { SettlementPanel } from "./_components/SettlementPanel";

interface SettlementRoutePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: SettlementRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return { title: messages[locale].appShell.pages.financeSettlement };
}

export default async function SettlementRoutePage({
  params,
}: SettlementRoutePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const path = FINANCE_PATHS.settlement;

  await requireFinanceAdmin(locale, path);
  const cookieHeader = await financeCookieHeader();

  const books = await fetchFinance(
    locale,
    path,
    v1.finance.ROUTES.books,
    v1.finance.financeBookListSchema,
    cookieHeader,
  );

  const companyBook =
    books.items.find((book) => book.type === "COMPANY") ?? books.items[0];

  if (!companyBook) {
    throw new Error(
      "No finance book exists. Run the finance seed to create the company and associate-pool books.",
    );
  }

  const t = messages[locale].finance.settlement;
  const { start, end } = currentMonthRange();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-medium">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.description}</p>
      </header>

      <SettlementPanel
        bookId={companyBook.id}
        currency={companyBook.functionalCurrency}
        defaultPeriodStart={start}
        defaultPeriodEnd={end}
      />
    </div>
  );
}

/** The current calendar month, as a half-open [start, end) day range. */
function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
