import { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  buttonVariants,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { ArrowRightIcon, FilterIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import {
  financeUserLabel,
  formatFinanceDateTime,
  formatMoney,
} from "@/lib/finance-format";
import { FinanceEmptyState } from "../../_components/FinanceEmptyState";
import { FinancePageHeader } from "../../_components/FinancePageHeader";
import { FinanceStatusBadge } from "../../_components/FinanceStatusBadge";
import type { TransactionListFilters } from "../page";

interface TransactionsPageProps {
  filters: TransactionListFilters;
  list: v1.finance.MoneyTransactionList;
  locale: SupportedLocale;
  newTransactionHref: string;
  transactionsHref: string;
}

const SELECT_CLASS_NAME =
  "mt-1 h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

export async function TransactionsPage({
  filters,
  list,
  locale,
  newTransactionHref,
  transactionsHref,
}: TransactionsPageProps) {
  const t = await getTranslations({ locale, namespace: "finance" });
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <FinancePageHeader
        title={t("transactions.title")}
        description={t("transactions.description")}
        action={
          <Link
            href={newTransactionHref}
            className={buttonVariants({ variant: "default" })}
          >
            <PlusIcon data-icon="inline-start" />
            {t("transactions.new")}
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FilterIcon className="size-4 text-muted-foreground" />
            {t("transactions.filters.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
            <NativeSelect
              label={t("transactions.filters.status")}
              name="status"
              value={filters.status}
              options={v1.finance.MONEY_TRANSACTION_STATUSES.map((status) => ({
                value: status,
                label: t(`enums.transactionStatuses.${status}`),
              }))}
              allLabel={t("transactions.filters.all")}
            />
            <NativeSelect
              label={t("transactions.filters.type")}
              name="type"
              value={filters.type}
              options={v1.finance.MONEY_TRANSACTION_TYPES.map((type) => ({
                value: type,
                label: t(`enums.transactionTypes.${type}`),
              }))}
              allLabel={t("transactions.filters.all")}
            />
            <NativeSelect
              label={t("transactions.filters.scope")}
              name="financialScope"
              value={filters.financialScope}
              options={v1.finance.MONEY_TRANSACTION_SCOPES.map((scope) => ({
                value: scope,
                label: t(`enums.financialScopes.${scope}`),
              }))}
              allLabel={t("transactions.filters.all")}
            />
            <NativeSelect
              label={t("transactions.filters.paymentMethod")}
              name="paymentMethod"
              value={filters.paymentMethod}
              options={v1.finance.PAYMENT_METHODS.map((method) => ({
                value: method,
                label: t(`enums.paymentMethods.${method}`),
              }))}
              allLabel={t("transactions.filters.all")}
            />
            <NativeSelect
              label={t("transactions.filters.billingStatus")}
              name="billingStatus"
              value={filters.billingStatus}
              options={v1.finance.BILLING_STATUSES.map((status) => ({
                value: status,
                label: t(`enums.billingStatuses.${status}`),
              }))}
              allLabel={t("transactions.filters.all")}
            />
            <div>
              <Label htmlFor="transactions-from">
                {t("transactions.filters.from")}
              </Label>
              <Input
                id="transactions-from"
                className="mt-1"
                name="from"
                type="date"
                defaultValue={filters.from}
              />
            </div>
            <div>
              <Label htmlFor="transactions-to">
                {t("transactions.filters.to")}
              </Label>
              <Input
                id="transactions-to"
                className="mt-1"
                name="to"
                type="date"
                defaultValue={filters.to}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex-1">
                {t("transactions.filters.apply")}
              </Button>
              <Link
                href={transactionsHref}
                className={buttonVariants({ variant: "outline" })}
              >
                {t("transactions.filters.reset")}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t("transactions.results", { count: list.total })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("transactions.pagination.page", {
            page: list.page,
            totalPages,
          })}
        </p>
      </div>

      {list.items.length === 0 ? (
        <FinanceEmptyState>
          <p className="font-medium text-foreground">
            {t("transactions.emptyTitle")}
          </p>
          <p className="mt-1">{t("transactions.emptyDescription")}</p>
        </FinanceEmptyState>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("transactions.table.occurredAt")}</TableHead>
                  <TableHead>{t("transactions.table.type")}</TableHead>
                  <TableHead>{t("transactions.table.status")}</TableHead>
                  <TableHead>{t("transactions.table.amount")}</TableHead>
                  <TableHead>{t("transactions.table.scope")}</TableHead>
                  <TableHead>{t("transactions.table.counterparty")}</TableHead>
                  <TableHead className="text-right">
                    {t("transactions.table.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.items.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      {formatFinanceDateTime(transaction.occurredAt, locale)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {t(`enums.transactionTypes.${transaction.type}`)}
                    </TableCell>
                    <TableCell>
                      <FinanceStatusBadge
                        status={transaction.status}
                        label={t(
                          `enums.transactionStatuses.${transaction.status}`,
                        )}
                      />
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {formatMoney(
                        transaction.amount,
                        transaction.currency,
                        locale,
                      )}
                    </TableCell>
                    <TableCell>
                      {t(`enums.financialScopes.${transaction.financialScope}`)}
                    </TableCell>
                    <TableCell>
                      {transactionPartyLabel(transaction, t)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`${transactionsHref}/${encodeURIComponent(
                          transaction.id,
                        )}`}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                        })}
                      >
                        {t("transactions.table.view")}
                        <ArrowRightIcon data-icon="inline-end" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {list.items.map((transaction) => (
              <Link
                key={transaction.id}
                href={`${transactionsHref}/${encodeURIComponent(
                  transaction.id,
                )}`}
                className="rounded-lg border border-border bg-card p-4 transition-colors duration-fast ease-standard hover:bg-muted"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {t(`enums.transactionTypes.${transaction.type}`)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatFinanceDateTime(transaction.occurredAt, locale)}
                    </p>
                  </div>
                  <FinanceStatusBadge
                    status={transaction.status}
                    label={t(`enums.transactionStatuses.${transaction.status}`)}
                  />
                </div>
                <p className="mt-4 text-lg font-semibold tabular-nums">
                  {formatMoney(
                    transaction.amount,
                    transaction.currency,
                    locale,
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {transactionPartyLabel(transaction, t)}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}

      <nav
        aria-label={t("transactions.pagination.label")}
        className="flex items-center justify-between gap-4"
      >
        {list.page > 1 ? (
          <Link
            href={pageHref(transactionsHref, filters, list.page - 1)}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("transactions.pagination.previous")}
          </Link>
        ) : (
          <span
            className={cn(
              buttonVariants({ variant: "outline" }),
              "pointer-events-none opacity-50",
            )}
            aria-disabled="true"
          >
            {t("transactions.pagination.previous")}
          </span>
        )}
        {list.page < totalPages ? (
          <Link
            href={pageHref(transactionsHref, filters, list.page + 1)}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("transactions.pagination.next")}
          </Link>
        ) : (
          <span
            className={cn(
              buttonVariants({ variant: "outline" }),
              "pointer-events-none opacity-50",
            )}
            aria-disabled="true"
          >
            {t("transactions.pagination.next")}
          </span>
        )}
      </nav>
    </div>
  );
}

function NativeSelect({
  allLabel,
  label,
  name,
  options,
  value,
}: {
  allLabel: string;
  label: string;
  name: string;
  options: Array<{ label: string; value: string }>;
  value?: string;
}) {
  const id = `transactions-${name}`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={SELECT_CLASS_NAME}
        name={name}
        defaultValue={value ?? ""}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function pageHref(
  basePath: string,
  filters: TransactionListFilters,
  page: number,
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (filters.financialScope) {
    params.set("financialScope", filters.financialScope);
  }
  if (filters.paymentMethod) {
    params.set("paymentMethod", filters.paymentMethod);
  }
  if (filters.billingStatus) {
    params.set("billingStatus", filters.billingStatus);
  }
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function transactionPartyLabel(
  transaction: v1.finance.MoneyTransaction,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (transaction.debtor && transaction.creditor) {
    return `${financeUserLabel(transaction.debtor)} → ${financeUserLabel(
      transaction.creditor,
    )}`;
  }
  const person =
    transaction.counterparty ??
    transaction.recipient ??
    transaction.creditor ??
    transaction.debtor;
  return person
    ? financeUserLabel(person)
    : t("transactions.table.noCounterparty");
}
