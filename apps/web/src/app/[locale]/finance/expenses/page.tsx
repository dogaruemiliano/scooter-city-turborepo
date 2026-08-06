import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components";
import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { FinanceEmptyState } from "../_components/FinanceEmptyState";
import { FinanceStatusBadge } from "../_components/FinanceStatusBadge";
import {
  financeCookieHeader,
  handleFinanceApiErrors,
  requireFinanceAdmin,
} from "../_lib/server";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import { formatMoney } from "@/lib/finance-format";

const EXPENSES_PATH = "/finance/expenses";
const NEW_EXPENSE_PATH = "/finance/expenses/new";

interface ExpensesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ExpensesPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  return { title: messages[locale].finance.expenses.list.title };
}

export default async function ExpensesPage({ params }: ExpensesPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  await requireFinanceAdmin(locale, EXPENSES_PATH);
  const cookieHeader = await financeCookieHeader();
  const expenses = await handleFinanceApiErrors(locale, EXPENSES_PATH, () =>
    webApi.fetch(
      `${v1.finance.EXPENSE_ROUTES.list}?page=1&pageSize=25`,
      v1.finance.expenseListSchema,
      { headers: { cookie: cookieHeader }, cache: "no-store" },
    ),
  );
  const t = await getTranslations({ locale, namespace: "finance.expenses" });

  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex justify-end">
        <Button
          nativeButton={false}
          render={<Link href={localizePath(NEW_EXPENSE_PATH, locale)} />}
        >
          <PlusIcon data-icon="inline-start" />
          {t("list.new")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("list.recent")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-(--card-spacing)">
          {expenses.items.length === 0 ? (
            <FinanceEmptyState>{t("list.empty")}</FinanceEmptyState>
          ) : (
            <>
              <div className="divide-y divide-border sm:hidden">
                {expenses.items.map((expense) => (
                  <article
                    key={expense.id}
                    className="grid gap-3 px-(--card-spacing) py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {expense.payee?.label ?? t("list.unknownPayee")}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {expense.occurredOn}
                        </p>
                      </div>
                      <p className="shrink-0 font-mono font-semibold tabular-nums">
                        {formatMoney(
                          expense.grossAmount,
                          expense.currency,
                          locale,
                        )}
                      </p>
                    </div>

                    <div className="flex min-w-0 items-center justify-between gap-4">
                      <p className="truncate text-sm text-muted-foreground">
                        {expense.category?.name ?? t("list.unknownCategory")}
                      </p>
                      <FinanceStatusBadge
                        status={expense.status}
                        label={t(`statuses.${expense.status}`)}
                      />
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("list.columns.date")}</TableHead>
                      <TableHead>{t("list.columns.payee")}</TableHead>
                      <TableHead>{t("list.columns.category")}</TableHead>
                      <TableHead>{t("list.columns.status")}</TableHead>
                      <TableHead className="text-right">
                        {t("list.columns.amount")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.items.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{expense.occurredOn}</TableCell>
                        <TableCell>
                          {expense.payee?.label ?? t("list.unknownPayee")}
                        </TableCell>
                        <TableCell>
                          {expense.category?.name ?? t("list.unknownCategory")}
                        </TableCell>
                        <TableCell>
                          <FinanceStatusBadge
                            status={expense.status}
                            label={t(`statuses.${expense.status}`)}
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatMoney(
                            expense.grossAmount,
                            expense.currency,
                            locale,
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
