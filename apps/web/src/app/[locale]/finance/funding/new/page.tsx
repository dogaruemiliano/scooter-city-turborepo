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
import { FundingForm } from "../_components/FundingForm";

interface NewFundingPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: NewFundingPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  return { title: messages[locale].appShell.pages.newFinanceFunding };
}

export default async function NewFundingPage({ params }: NewFundingPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const path = FINANCE_PATHS.newFunding;
  const user = await requireFinanceAdmin(locale, path);
  const cookieHeader = await financeCookieHeader();
  const [books, accounts] = await Promise.all([
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
      `${v1.finance.ROUTES.accounts.list}?${new URLSearchParams({
        bookType: "COMPANY",
      })}`,
      v1.finance.ledgerAccountListSchema,
      cookieHeader,
    ),
  ]);
  const companyBook = books.items.find((book) => book.type === "COMPANY");
  if (!companyBook) {
    throw new Error("No company finance book exists. Run the finance seed.");
  }
  const t = messages[locale].finance.funding;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex max-w-3xl flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.description}</p>
      </header>
      <FundingForm
        book={companyBook}
        accounts={accounts.items}
        currentUserId={user.id}
      />
    </div>
  );
}
