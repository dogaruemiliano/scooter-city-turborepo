"use client";

import { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import {
  DatePartsField,
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
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { startTransition, useCallback, useRef, useState } from "react";

import { InfiniteListFooter } from "@/components/InfiniteListFooter";
import { UrlFilterSheet } from "@/components/UrlFilterSheet";
import { webApi } from "@/lib/api";
import {
  financeUserLabel,
  formatFinanceDateTime,
  formatTransactionAmount,
} from "@/lib/finance-format";
import { FinanceEmptyState } from "../../_components/FinanceEmptyState";
import { FinanceStatusBadge } from "../../_components/FinanceStatusBadge";
import type { TransactionListFilters } from "../page";

interface TransactionsPageProps {
  filters: TransactionListFilters;
  list: v1.finance.MoneyTransactionList;
  locale: SupportedLocale;
  newTransactionHref: string;
  query: v1.finance.ListMoneyTransactionsQuery;
  transactionsHref: string;
}

const SELECT_CLASS_NAME =
  "mt-1 h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring md:h-11 md:text-sm";

export function TransactionsPage({
  filters,
  list,
  locale,
  newTransactionHref,
  query,
  transactionsHref,
}: TransactionsPageProps) {
  const t = useTranslations("finance");
  const [items, setItems] = useState(() => list.items);
  const [total, setTotal] = useState(list.total);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [exhausted, setExhausted] = useState(
    () => list.items.length >= list.total,
  );
  const nextPageRef = useRef(list.page + 1);
  const loadingRef = useRef(false);
  const hasMore = !exhausted && items.length < total;

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    setLoadFailed(false);
    try {
      const next = await webApi.fetch(
        transactionsListPath(query, nextPageRef.current),
        v1.finance.moneyTransactionListSchema,
        { cache: "no-store" },
      );
      nextPageRef.current += 1;
      setTotal(next.total);
      startTransition(() => {
        setItems((current) => {
          const knownIds = new Set(current.map((item) => item.id));
          const additions = next.items.filter((item) => !knownIds.has(item.id));
          return [...current, ...additions];
        });
      });
      if (next.items.length === 0 || next.page * next.pageSize >= next.total) {
        setExhausted(true);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, query]);

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <UrlFilterSheet
            appliedCount={transactionFilterCount(filters)}
            applyLabel={t("transactions.filters.apply")}
            baseHref={transactionsHref}
            description={t("transactions.filters.description")}
            formId="transactions-filter-form"
            resetLabel={t("transactions.filters.reset")}
            title={t("transactions.filters.title")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <NativeSelect
                label={t("transactions.filters.status")}
                name="status"
                value={filters.status}
                options={v1.finance.MONEY_TRANSACTION_STATUSES.map(
                  (status) => ({
                    value: status,
                    label: t(`enums.transactionStatuses.${status}`),
                  }),
                )}
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
                <Label htmlFor="transactions-from-day">
                  {t("transactions.filters.from")}
                </Label>
                <DatePartsField
                  baseId="transactions-from"
                  className="mt-1"
                  label={t("transactions.filters.from")}
                  locale={locale}
                  name="from"
                  defaultValue={filters.from}
                />
              </div>
              <div>
                <Label htmlFor="transactions-to-day">
                  {t("transactions.filters.to")}
                </Label>
                <DatePartsField
                  baseId="transactions-to"
                  className="mt-1"
                  label={t("transactions.filters.to")}
                  locale={locale}
                  name="to"
                  defaultValue={filters.to}
                />
              </div>
            </div>
          </UrlFilterSheet>
          <p className="text-sm text-muted-foreground">
            {t("transactions.results", { count: total })}
          </p>
        </div>
        <Link
          href={newTransactionHref}
          className={cn(buttonVariants({ variant: "default" }), "shrink-0")}
        >
          <PlusIcon data-icon="inline-start" />
          {t("transactions.new")}
        </Link>
      </div>

      {items.length === 0 ? (
        <FinanceEmptyState>
          <p className="font-medium text-foreground">
            {t("transactions.emptyTitle")}
          </p>
          <p className="mt-1">{t("transactions.emptyDescription")}</p>
        </FinanceEmptyState>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-border md:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("transactions.table.transaction")}</TableHead>
                  <TableHead>{t("transactions.table.direction")}</TableHead>
                  <TableHead className="w-36 text-right">
                    {t("transactions.table.amount")}
                  </TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="min-w-0">
                      <Link
                        href={`${transactionsHref}/${encodeURIComponent(
                          transaction.id,
                        )}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {transaction.description ??
                          formatFinanceDateTime(transaction.occurredAt, locale)}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {transaction.description ? (
                          <span>
                            {formatFinanceDateTime(
                              transaction.occurredAt,
                              locale,
                            )}
                          </span>
                        ) : null}
                        {transaction.status !== "POSTED" ? (
                          <FinanceStatusBadge
                            status={transaction.status}
                            label={t(
                              `enums.transactionStatuses.${transaction.status}`,
                            )}
                          />
                        ) : null}
                        {!isBasicMoneyType(transaction.type) ? (
                          <span>
                            {t(`enums.transactionTypes.${transaction.type}`)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-0 text-sm text-muted-foreground">
                      <div
                        className="truncate"
                        title={transactionDirectionLabel(transaction, t)}
                      >
                        {transactionDirectionLabel(transaction, t)}
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        transaction.type === "EXPENSE" && "text-destructive",
                        transaction.type === "INCOME" && "text-success",
                      )}
                    >
                      {formatTransactionAmount(
                        transaction.amount,
                        transaction.currency,
                        locale,
                        transaction.type,
                      )}
                    </TableCell>
                    <TableCell className="px-1">
                      <Link
                        href={`${transactionsHref}/${encodeURIComponent(
                          transaction.id,
                        )}`}
                        aria-label={t("transactions.table.view")}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "icon-sm" }),
                          "text-muted-foreground",
                        )}
                      >
                        <ArrowRightIcon />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-2 md:hidden">
            {items.map((transaction) => (
              <Link
                key={transaction.id}
                href={`${transactionsHref}/${encodeURIComponent(
                  transaction.id,
                )}`}
                className="flex min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-border bg-card px-3 py-2.5 transition-colors duration-fast ease-standard hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {transaction.description ??
                      formatFinanceDateTime(transaction.occurredAt, locale)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {transaction.description ? (
                      <span>
                        {formatFinanceDateTime(transaction.occurredAt, locale)}
                      </span>
                    ) : null}
                    <span className="min-w-0 max-w-full break-words">
                      {transactionDirectionLabel(transaction, t)}
                    </span>
                    {transaction.status !== "POSTED" ? (
                      <FinanceStatusBadge
                        status={transaction.status}
                        label={t(
                          `enums.transactionStatuses.${transaction.status}`,
                        )}
                      />
                    ) : null}
                    {!isBasicMoneyType(transaction.type) ? (
                      <span>
                        {t(`enums.transactionTypes.${transaction.type}`)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <span
                  className={cn(
                    "min-w-0 truncate text-right font-medium tabular-nums",
                    transaction.type === "EXPENSE" && "text-destructive",
                    transaction.type === "INCOME" && "text-success",
                  )}
                >
                  {formatTransactionAmount(
                    transaction.amount,
                    transaction.currency,
                    locale,
                    transaction.type,
                  )}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {items.length > 0 ? (
        <InfiniteListFooter
          hasMore={hasMore}
          loading={loading}
          error={loadFailed ? t("feedback.genericError") : null}
          onLoadMore={loadMore}
        />
      ) : null}
    </div>
  );
}

function transactionFilterCount(filters: TransactionListFilters): number {
  return [
    filters.status,
    filters.type,
    filters.financialScope,
    filters.paymentMethod,
    filters.billingStatus,
    filters.from,
    filters.to,
  ].filter(Boolean).length;
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

function transactionsListPath(
  query: v1.finance.ListMoneyTransactionsQuery,
  page: number,
): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(query.pageSize),
  });
  if (query.status) params.set("status", query.status);
  if (query.type) params.set("type", query.type);
  if (query.financialScope) {
    params.set("financialScope", query.financialScope);
  }
  if (query.paymentMethod) {
    params.set("paymentMethod", query.paymentMethod);
  }
  if (query.billingStatus) {
    params.set("billingStatus", query.billingStatus);
  }
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  return `${v1.finance.ROUTES.transactions.list}?${params}`;
}

function isBasicMoneyType(type: v1.finance.MoneyTransactionType): boolean {
  return type === "INCOME" || type === "EXPENSE";
}

function transactionDirectionLabel(
  transaction: v1.finance.MoneyTransaction,
  t: ReturnType<typeof useTranslations>,
): string {
  const counterparty = partyLabel(
    transaction.counterpartyEntity,
    transaction.counterparty,
  );
  const recipient = partyLabel(
    transaction.recipientCounterparty,
    transaction.recipient,
  );
  const debtor = partyLabel(transaction.debtorCounterparty, transaction.debtor);
  const creditor = partyLabel(
    transaction.creditorCounterparty,
    transaction.creditor,
  );
  const sourceWallet = transaction.balanceChanges.find((change) =>
    change.amountDelta.startsWith("-"),
  )?.wallet.name;
  const destinationWallet = transaction.balanceChanges.find(
    (change) => !change.amountDelta.startsWith("-"),
  )?.wallet.name;

  if (debtor || creditor) {
    return directionalLabel(debtor, creditor, t);
  }

  switch (transaction.type) {
    case "INCOME":
    case "USER_PAYMENT":
    case "GUARANTEE_RECEIVED":
    case "CAPITAL_CONTRIBUTION":
      return directionalLabel(counterparty ?? sourceWallet, undefined, t);
    case "EXPENSE":
    case "USER_CHARGE":
    case "GUARANTEE_REFUNDED":
    case "REFUND":
      return directionalLabel(undefined, counterparty ?? recipient, t);
    case "REIMBURSEMENT":
    case "PERSONAL_EXTRACTION":
    case "COMPANY_DISTRIBUTION":
      return directionalLabel(undefined, recipient ?? counterparty, t);
    case "TRANSFER":
    case "PERSONAL_FUNDS_SPLIT":
      return directionalLabel(sourceWallet, destinationWallet, t);
    case "ADJUSTMENT":
    case "REVERSAL":
    case "PERSONAL_FUNDS_CLAIM":
      return directionalLabel(
        counterparty ?? sourceWallet,
        recipient ?? destinationWallet,
        t,
      );
  }
}

function partyLabel(
  entity: v1.finance.FinanceCounterpartySummary | null | undefined,
  user: v1.finance.FinanceUserSummary | null,
): string | undefined {
  return entity?.label ?? (user ? financeUserLabel(user) : undefined);
}

function directionalLabel(
  from: string | undefined,
  to: string | undefined,
  t: ReturnType<typeof useTranslations>,
): string {
  const fromLabel = from
    ? t("transactions.table.fromParty", { party: from })
    : null;
  const toLabel = to ? t("transactions.table.toParty", { party: to }) : null;
  return (
    [fromLabel, toLabel].filter(Boolean).join(" → ") ||
    t("transactions.table.noCounterparty")
  );
}
