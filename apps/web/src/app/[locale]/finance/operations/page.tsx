import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { buttonVariants, ListLayout } from "@repo/ui/components";
import type { Metadata } from "next";

import { canAccess } from "@/lib/access";
import { resolveRouteLocale } from "@/i18n/paths";
import { Link } from "@/i18n/navigation";
import { OperationList } from "../_components/OperationList";
import { OperationFilters } from "../_components/OperationFilters";
import { OperationPagination } from "../_components/OperationPagination";
import {
  financeSearchParams,
  readOperationQuery,
  type FinanceSearchParams,
} from "../_lib/operation-list-query";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinancePermission,
} from "../_lib/finance-server";
import { FINANCE_PATHS } from "../_lib/links";

const PAGE_SIZE = 50;

interface OperationsRoutePageProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<FinanceSearchParams>;
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
  searchParams,
}: OperationsRoutePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const path = FINANCE_PATHS.operations;
  const search = financeSearchParams((await searchParams) ?? {});
  const { filters, apiQuery } = readOperationQuery(search, PAGE_SIZE);

  const user = await requireFinancePermission(
    locale,
    path,
    "finance.operations.read",
  );
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
      `${v1.finance.ROUTES.operations.list}?${apiQuery}`,
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
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-medium">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.description}</p>
      </header>

      <ListLayout
        filters={
          <OperationFilters
            value={filters}
            books={books.items.map(({ id, name, type }) => ({
              id,
              name,
              type,
            }))}
          />
        }
        action={
          canAccess(user, "finance.funding.create") ? (
            <Link href={FINANCE_PATHS.newFunding} className={buttonVariants()}>
              {messages[locale].finance.overview.addCompanyMoney}
            </Link>
          ) : null
        }
        footer={
          <OperationPagination
            operations={operations}
            locale={locale}
            pathname={path}
            search={search}
            filters={filters}
          />
        }
      >
        <OperationList
          items={operations.items}
          currency={currency}
          locale={locale}
          emptyLabel={t.empty}
        />
      </ListLayout>
    </div>
  );
}
