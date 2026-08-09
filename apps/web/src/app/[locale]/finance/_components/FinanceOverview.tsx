import { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DatePartsField,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { localizePath } from "@/i18n/paths";
import {
  financeUserLabel,
  formatFinanceDateTime,
  formatMoney,
} from "@/lib/finance-format";
import { cn } from "@repo/ui/lib/utils";
import { claimSettlementHref } from "../_lib/links";
import type { FinancePeriod } from "../_lib/period";
import { FinanceEmptyState } from "./FinanceEmptyState";
import { FinanceStatusBadge } from "./FinanceStatusBadge";

interface FinanceOverviewProps {
  locale: SupportedLocale;
  period: FinancePeriod;
  summary: v1.finance.FinanceSummary;
  recentTransactions: v1.finance.MoneyTransactionList;
  claims: { items: v1.finance.OutstandingPersonalClaim[] };
}

export async function FinanceOverview({
  locale,
  period,
  summary,
  recentTransactions,
  claims,
}: FinanceOverviewProps) {
  const t = await getTranslations({ locale, namespace: "finance" });
  const transactionsHref = localizePath("/finance/transactions", locale);
  const newExpenseHref = localizePath("/finance/expenses/new", locale);
  const newTransactionHref = localizePath("/finance/transactions/new", locale);
  const claimsHref = localizePath("/finance/claims", locale);
  const companiesHref = localizePath("/finance/companies", locale);

  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={companiesHref} />}
        >
          {t("overview.manageCompanies")}
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={newTransactionHref} />}
        >
          {t("overview.advancedTransaction")}
        </Button>
        <Button nativeButton={false} render={<Link href={newExpenseHref} />}>
          <PlusIcon data-icon="inline-start" />
          {t("overview.newExpense")}
        </Button>
      </div>

      {period.usedFallback ? (
        <Alert variant="destructive">
          <AlertDescription>{t("overview.period.invalid")}</AlertDescription>
        </Alert>
      ) : null}

      <form
        method="get"
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="finance-from-day">
              {t("overview.period.from")}
            </Label>
            <DatePartsField
              baseId="finance-from"
              label={t("overview.period.from")}
              locale={locale}
              name="from"
              defaultValue={period.fromDate}
              aria-describedby="finance-period-hint"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance-to-day">{t("overview.period.to")}</Label>
            <DatePartsField
              baseId="finance-to"
              label={t("overview.period.to")}
              locale={locale}
              name="to"
              defaultValue={period.toDate}
              aria-describedby="finance-period-hint"
              required
            />
          </div>
        </div>
        <Button type="submit" variant="outline">
          {t("overview.period.apply")}
        </Button>
        <p
          id="finance-period-hint"
          className="text-xs text-muted-foreground sm:col-span-2"
        >
          {t("overview.period.utcHint")}
        </p>
      </form>

      <section
        aria-label={t("overview.summary.label")}
        className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2 xl:grid-cols-4"
      >
        <SummaryMetric
          label={t("overview.summary.income")}
          values={summary.income}
          locale={locale}
          className="border-b border-border sm:border-r xl:border-b-0"
        />
        <SummaryMetric
          label={t("overview.summary.expenses")}
          values={summary.expenses}
          locale={locale}
          className="border-b border-border xl:border-r xl:border-b-0"
        />
        <SummaryMetric
          label={t("overview.summary.companyMoney")}
          values={summary.companyMoney.map((item) => ({
            amount: item.amount,
            currency: item.currency,
            detail: item.walletName,
          }))}
          locale={locale}
          className="border-b border-border sm:border-r sm:border-b-0"
        />
        <SummaryMetric
          label={t("overview.summary.guarantees")}
          values={summary.currentBalances.company
            .filter((item) => item.bucket === "CUSTOMER_GUARANTEE_FUNDS")
            .map((item) => ({
              amount: item.balance,
              currency: item.currency,
              detail: item.wallet.name,
            }))}
          locale={locale}
        />
      </section>

      <p className="-mt-6 text-xs text-muted-foreground">
        {t("overview.summary.generatedAt", {
          date: formatFinanceDateTime(summary.generatedAt, locale),
        })}
      </p>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t("overview.recent.title")}</CardTitle>
            <CardDescription>
              {t("overview.recent.description")}
            </CardDescription>
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href={transactionsHref} />}
              >
                {t("overview.recent.viewAll")}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {recentTransactions.items.length === 0 ? (
              <FinanceEmptyState>
                {t("overview.recent.empty")}
              </FinanceEmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("overview.recent.columns.type")}</TableHead>
                    <TableHead>
                      {t("overview.recent.columns.description")}
                    </TableHead>
                    <TableHead>{t("overview.recent.columns.status")}</TableHead>
                    <TableHead>{t("overview.recent.columns.date")}</TableHead>
                    <TableHead className="text-right">
                      {t("overview.recent.columns.amount")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTransactions.items.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>
                        <Link
                          href={localizePath(
                            `/finance/transactions/${encodeURIComponent(transaction.id)}`,
                            locale,
                          )}
                          className="font-medium text-link hover:text-link-hover hover:underline"
                        >
                          {t(`enums.transactionTypes.${transaction.type}`)}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {transaction.description ??
                          t("overview.recent.noDescription")}
                      </TableCell>
                      <TableCell>
                        <FinanceStatusBadge
                          status={transaction.status}
                          label={t(
                            `enums.transactionStatuses.${transaction.status}`,
                          )}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatFinanceDateTime(transaction.occurredAt, locale)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium tabular-nums">
                        {formatMoney(
                          transaction.amount,
                          transaction.currency,
                          locale,
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("overview.claims.title")}</CardTitle>
            <CardDescription>
              {t("overview.claims.description")}
            </CardDescription>
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href={claimsHref} />}
              >
                {t("overview.claims.viewAll")}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {claims.items.length === 0 ? (
              <FinanceEmptyState>
                {t("overview.claims.empty")}
              </FinanceEmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {claims.items.slice(0, 5).map((claim) => (
                  <li
                    key={`${claim.debtorUserId}:${claim.creditorUserId}:${claim.currency}`}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {financeUserLabel(claim.debtor)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t("overview.claims.owes", {
                          creditor: financeUserLabel(claim.creditor),
                        })}
                      </p>
                    </div>
                    <Button
                      variant="link"
                      size="sm"
                      className="shrink-0 font-mono tabular-nums"
                      nativeButton={false}
                      render={
                        <Link href={claimSettlementHref(claim, locale)} />
                      }
                    >
                      {formatMoney(claim.amount, claim.currency, locale)}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <BalancesSection locale={locale} summary={summary} />
    </main>
  );
}

interface SummaryMetricValue {
  amount: string;
  currency: string;
  detail?: string;
}

function SummaryMetric({
  label,
  values,
  locale,
  className,
}: {
  label: string;
  values: SummaryMetricValue[];
  locale: SupportedLocale;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 p-4", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {values.length === 0 ? (
        <p className="mt-3 font-mono text-xl font-semibold tabular-nums">—</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {values.slice(0, 3).map((value, index) => (
            <li
              key={`${value.currency}:${value.detail ?? index}`}
              className="min-w-0"
            >
              <p className="truncate font-mono text-xl font-semibold tabular-nums">
                {formatMoney(value.amount, value.currency, locale)}
              </p>
              {value.detail ? (
                <p className="truncate text-xs text-muted-foreground">
                  {value.detail}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function BalancesSection({
  locale,
  summary,
}: {
  locale: SupportedLocale;
  summary: v1.finance.FinanceSummary;
}) {
  const t = await getTranslations({ locale, namespace: "finance" });
  const rows = [
    ...summary.currentBalances.company.map((balance) => ({
      ...balance,
      group: t("overview.balances.company"),
    })),
    ...summary.currentBalances.admins.map((balance) => ({
      ...balance,
      group: t("overview.balances.admins"),
    })),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("overview.balances.title")}</CardTitle>
        <CardDescription>{t("overview.balances.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <FinanceEmptyState>{t("overview.balances.empty")}</FinanceEmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("overview.balances.columns.group")}</TableHead>
                <TableHead>{t("overview.balances.columns.wallet")}</TableHead>
                <TableHead>{t("overview.balances.columns.owner")}</TableHead>
                <TableHead>{t("overview.balances.columns.bucket")}</TableHead>
                <TableHead className="text-right">
                  {t("overview.balances.columns.balance")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={`${row.wallet.id}:${row.bucket}:${row.currency}`}
                >
                  <TableCell>
                    <Badge variant="secondary">{row.group}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={localizePath(
                        `/finance/wallets/${encodeURIComponent(row.wallet.id)}`,
                        locale,
                      )}
                      className="text-link hover:text-link-hover hover:underline"
                    >
                      {row.wallet.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.wallet.owner
                      ? financeUserLabel(row.wallet.owner)
                      : t("common.noOwner")}
                  </TableCell>
                  <TableCell>
                    {t(`enums.balanceBuckets.${row.bucket}`)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium tabular-nums">
                    {formatMoney(row.balance, row.currency, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
