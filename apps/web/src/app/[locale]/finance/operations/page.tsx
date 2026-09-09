import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { buttonVariants } from "@repo/ui/components";
import type { Metadata } from "next";

import { resolveRouteLocale } from "@/i18n/paths";
import { Link } from "@/i18n/navigation";
import { OperationList } from "../_components/OperationList";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinanceAdmin,
} from "../_lib/finance-server";
import { FINANCE_PATHS } from "../_lib/links";

const PAGE_SIZE = 50;

interface OperationsRoutePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: OperationsRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return { title: messages[locale].appShell.pages.financeOperations };
}

export default async function OperationsRoutePage({
  params,
}: OperationsRoutePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const path = FINANCE_PATHS.operations;

  await requireFinanceAdmin(locale, path);
  const cookieHeader = await financeCookieHeader();

  const [books, operations] = await Promise.all([
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
      `${v1.finance.ROUTES.operations.list}?${new URLSearchParams({
        pageSize: String(PAGE_SIZE),
      })}`,
      v1.finance.financialOperationListSchema,
      cookieHeader,
    ),
  ]);

  const t = messages[locale].finance.operations;
  const currency =
    books.items.find((book) => book.type === "COMPANY")?.functionalCurrency ??
    "RON";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-medium">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.description}</p>
        </div>
        <Link href={FINANCE_PATHS.newFunding} className={buttonVariants()}>
          {messages[locale].finance.overview.addCompanyMoney}
        </Link>
      </header>

      <OperationList
        items={operations.items}
        currency={currency}
        locale={locale}
        emptyLabel={t.empty}
      />
    </div>
  );
}
