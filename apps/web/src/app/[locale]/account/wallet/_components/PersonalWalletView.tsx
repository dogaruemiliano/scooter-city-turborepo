import type { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  buttonVariants,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  RefreshCcwIcon,
} from "lucide-react";
import Link from "next/link";

import {
  formatFinanceDateTime,
  formatMoney,
} from "../../../../../lib/finance-format";

export function PersonalWalletView({
  locale,
  transactions,
  wallet,
}: {
  locale: SupportedLocale;
  transactions: v1.finance.MoneyTransactionList | null;
  wallet: v1.finance.Wallet;
}) {
  const t = messages[locale].finance;

  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>{wallet.name}</CardTitle>
              <CardDescription>{t.walletTypes[wallet.type]}</CardDescription>
            </div>
            <Badge variant={wallet.isActive ? "secondary" : "outline"}>
              {wallet.isActive
                ? t.personalWallet.active
                : t.personalWallet.inactive}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {wallet.balances.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t.personalWallet.noBalances}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.wallets.fields.bucket}</TableHead>
                  <TableHead>{t.wallets.fields.currency}</TableHead>
                  <TableHead className="text-right">
                    {t.wallets.fields.balance}
                  </TableHead>
                  <TableHead>{t.personalWallet.balanceUpdated}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallet.balances.map((balance) => (
                  <TableRow key={`${balance.bucket}:${balance.currency}`}>
                    <TableCell>{t.balanceBuckets[balance.bucket]}</TableCell>
                    <TableCell>{balance.currency}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(balance.balance, balance.currency, locale)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatFinanceDateTime(balance.updatedAt, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {transactions ? (
        <TransactionHistory
          locale={locale}
          transactions={transactions}
          walletId={wallet.id}
        />
      ) : null}
    </main>
  );
}

function TransactionHistory({
  locale,
  transactions,
  walletId,
}: {
  locale: SupportedLocale;
  transactions: v1.finance.MoneyTransactionList;
  walletId: string;
}) {
  const t = messages[locale].finance;
  const groups = groupTransactionsByDay(transactions.items, locale);
  const totalPages = Math.max(
    1,
    Math.ceil(transactions.total / transactions.pageSize),
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="wallet-history">
      <div className="flex flex-col gap-1">
        <h2
          id="wallet-history"
          className="text-xl font-semibold tracking-tight"
        >
          {t.personalWallet.historyTitle}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.personalWallet.historyDescription}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <p className="font-medium">{t.personalWallet.noTransactions}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.personalWallet.noTransactionsDescription}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {groups.map((group) => (
            <div key={group.key}>
              <h3 className="border-b border-border bg-muted px-4 py-2 text-xs font-semibold uppercase text-muted-foreground sm:px-5">
                {group.label}
              </h3>
              <ul className="divide-y divide-border">
                {group.transactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    locale={locale}
                    transaction={transaction}
                    walletId={walletId}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          aria-label={t.personalWallet.paginationLabel}
          className="flex items-center justify-between gap-4"
        >
          {transactions.page > 1 ? (
            <Link
              href={`?page=${transactions.page - 1}`}
              className={buttonVariants({ variant: "outline" })}
            >
              {t.transactions.pagination.previous}
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm text-muted-foreground">
            {t.transactions.pagination.page
              .replace("{page}", String(transactions.page))
              .replace("{totalPages}", String(totalPages))}
          </p>
          {transactions.page < totalPages ? (
            <Link
              href={`?page=${transactions.page + 1}`}
              className={buttonVariants({ variant: "outline" })}
            >
              {t.transactions.pagination.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  );
}

function TransactionRow({
  locale,
  transaction,
  walletId,
}: {
  locale: SupportedLocale;
  transaction: v1.finance.MoneyTransaction;
  walletId: string;
}) {
  const t = messages[locale].finance;
  const changes = transaction.balanceChanges.filter(
    (change) => change.walletId === walletId,
  );
  const isReversal = transaction.type === "REVERSAL";
  const firstDelta = changes[0]?.amountDelta ?? "0";
  const isIncoming = !firstDelta.startsWith("-") && firstDelta !== "0";
  const Icon = isReversal
    ? RefreshCcwIcon
    : isIncoming
      ? ArrowDownLeftIcon
      : ArrowUpRightIcon;

  return (
    <li className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          isIncoming
            ? "bg-success/10 text-success"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon aria-hidden="true" className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {transaction.description ||
            t.enums.transactionTypes[transaction.type]}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {formatTransactionTime(transaction.occurredAt, locale)} ·{" "}
          {t.enums.transactionTypes[transaction.type]}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {changes.map((change) => (
          <p
            key={change.id}
            className={cn(
              "font-semibold tabular-nums",
              change.amountDelta.startsWith("-")
                ? "text-foreground"
                : "text-success",
            )}
          >
            {formatSignedMoney(change.amountDelta, change.currency, locale)}
          </p>
        ))}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {changes.map((change) => t.balanceBuckets[change.bucket]).join(", ")}
        </p>
      </div>
    </li>
  );
}

function groupTransactionsByDay(
  transactions: v1.finance.MoneyTransaction[],
  locale: SupportedLocale,
) {
  const now = new Date();
  const today = calendarDay(now, locale);
  const groups = new Map<
    string,
    { key: string; label: string; transactions: v1.finance.MoneyTransaction[] }
  >();

  for (const transaction of transactions) {
    const date = new Date(transaction.occurredAt);
    const day = calendarDay(date, locale);
    const key = `${day.year}-${day.month}-${day.day}`;
    const existing = groups.get(key);
    if (existing) {
      existing.transactions.push(transaction);
    } else {
      groups.set(key, {
        key,
        label: formatDayLabel(day, today, date, locale),
        transactions: [transaction],
      });
    }
  }

  return [...groups.values()];
}

function calendarDay(date: Date, locale: SupportedLocale) {
  const parts = new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { day: value("day"), month: value("month"), year: value("year") };
}

function formatDayLabel(
  day: ReturnType<typeof calendarDay>,
  today: ReturnType<typeof calendarDay>,
  date: Date,
  locale: SupportedLocale,
) {
  const t = messages[locale].finance.personalWallet;
  const ordinal = Date.UTC(day.year, day.month - 1, day.day) / 86_400_000;
  const todayOrdinal =
    Date.UTC(today.year, today.month - 1, today.day) / 86_400_000;
  if (ordinal === todayOrdinal) return t.today;
  if (ordinal === todayOrdinal - 1) return t.yesterday;

  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
    day: "numeric",
    month: "long",
    ...(day.year === today.year ? {} : { year: "numeric" }),
  }).format(date);
}

function formatTransactionTime(value: string, locale: SupportedLocale) {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSignedMoney(
  amount: string,
  currency: string,
  locale: SupportedLocale,
) {
  if (amount.startsWith("-") || amount === "0") {
    return formatMoney(amount, currency, locale);
  }
  return `+${formatMoney(amount, currency, locale)}`;
}
