import { v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  Card,
  CardAction,
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
import { ArrowLeftIcon, EqualIcon, MinusIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageTitleOverride } from "@/components/PageTitleOverride";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import {
  formatFinanceDateTime,
  formatMoney,
  formatTransactionAmount,
} from "@/lib/finance-format";
import { FinanceEmptyState } from "../../_components/FinanceEmptyState";
import { FinanceStatusBadge } from "../../_components/FinanceStatusBadge";
import {
  financeCookieHeader,
  handleFinanceApiErrors,
  requireFinanceAdmin,
} from "../../_lib/server";
import { companyDisplayName } from "../_components/CompanyLegalFormIcon";

const COMPANIES_PATH = "/finance/companies";
const PAGE_SIZE = 25;

interface CompanyDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CompanyDetailPage({
  params,
  searchParams,
}: CompanyDetailPageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const routePath = `${COMPANIES_PATH}/${encodeURIComponent(id)}`;
  await requireFinanceAdmin(locale, routePath);
  const cookie = await financeCookieHeader();
  const company = await handleFinanceApiErrors(
    locale,
    routePath,
    () =>
      webApi.fetch(
        v1.finance.ROUTES.companies.get(id),
        v1.finance.companySchema,
        { headers: { cookie }, cache: "no-store" },
      ),
    { notFoundOn404: true },
  );
  const query = await searchParams;
  const period = companyPeriod(first(query.period));
  const page = positiveInteger(first(query.page)) ?? 1;
  const [stats, transactions] = await Promise.all([
    handleFinanceApiErrors(locale, routePath, () =>
      webApi.fetch(
        `${v1.finance.ROUTES.companies.stats(id)}?period=${period}`,
        v1.finance.companyStatsSchema,
        { headers: { cookie }, cache: "no-store" },
      ),
    ),
    handleFinanceApiErrors(locale, routePath, () =>
      webApi.fetch(
        transactionListPath(company, page),
        v1.finance.moneyTransactionListSchema,
        { headers: { cookie }, cache: "no-store" },
      ),
    ),
  ]);
  const t = await getTranslations({ locale, namespace: "finance" });
  const companiesHref = localizePath(COMPANIES_PATH, locale);
  const detailHref = localizePath(routePath, locale);
  const displayName = companyDisplayName(
    company,
    t(`enums.companyLegalForms.${company.legalForm}`),
  );
  const totals =
    stats.totals.length > 0
      ? stats.totals
      : [{ currency: "RON", income: "0.00", expenses: "0.00", net: "0.00" }];
  const totalPages = Math.max(1, Math.ceil(transactions.total / PAGE_SIZE));

  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageTitleOverride title={displayName} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          className="hidden w-fit md:inline-flex"
          nativeButton={false}
          render={<Link href={companiesHref} />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {t("companies.detail.back")}
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t("companies.fields.taxIdentifier")}:{" "}
            {company.taxIdentifier ?? t("common.notProvided")}
          </span>
          <Badge variant={company.isActive ? "secondary" : "outline"}>
            {t(company.isActive ? "common.active" : "common.inactive")}
          </Badge>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("companies.detail.information")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
              <DetailRow
                label={t("companies.fields.legalForm")}
                value={t(`enums.companyLegalForms.${company.legalForm}`)}
              />
              <DetailRow
                label={t("companies.fields.tradingName")}
                value={company.tradingName ?? t("common.notProvided")}
              />
              <DetailRow
                label={t("companies.fields.registrationNumber")}
                value={company.registrationNumber ?? t("common.notProvided")}
              />
              <DetailRow
                label={t("companies.fields.email")}
                value={company.email ?? t("common.notProvided")}
              />
              <DetailRow
                label={t("companies.fields.phone")}
                value={company.phone ?? t("common.notProvided")}
              />
              <DetailRow
                label={t("companies.fields.address")}
                value={companyAddress(company) ?? t("common.notProvided")}
              />
            </dl>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t("companies.detail.statistics")}</CardTitle>
            <CardDescription>
              {t("companies.detail.statisticsDescription")}
            </CardDescription>
            <CardAction>
              <Badge variant="outline" className="tabular-nums">
                {t("companies.detail.transactionCount", {
                  count: stats.transactionCount,
                })}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <nav
              className="w-full sm:ml-auto sm:w-72"
              aria-label={t("companies.detail.periodLabel")}
            >
              <ul className="grid grid-cols-5 gap-1 rounded-lg border border-border bg-muted p-1">
                {v1.finance.COMPANY_ACTIVITY_PERIODS.map((value) => {
                  const selected = period === value;
                  const fullLabel = t(`companies.detail.periods.${value}`);

                  return (
                    <li key={value} className="min-w-0">
                      <Link
                        href={`${detailHref}?period=${value}`}
                        prefetch={false}
                        replace
                        scroll={false}
                        aria-current={selected ? "page" : undefined}
                        aria-label={fullLabel}
                        title={fullLabel}
                        className={cn(
                          buttonVariants({
                            variant: selected ? "default" : "ghost",
                            size: "sm",
                          }),
                          "w-full min-w-0 px-2 font-semibold",
                        )}
                      >
                        {t(`companies.detail.periodAbbreviations.${value}`)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="flex flex-col gap-3">
              {totals.map((total) => (
                <div
                  key={total.currency}
                  className="grid overflow-hidden rounded-xl border border-border sm:grid-cols-3"
                >
                  <Stat
                    label={t("companies.detail.net")}
                    value={formatMoney(total.net, total.currency, locale)}
                    tone="neutral"
                    emphasis
                  />
                  <Stat
                    label={t("companies.detail.income")}
                    value={formatMoney(total.income, total.currency, locale)}
                    tone="positive"
                  />
                  <Stat
                    label={t("companies.detail.expenses")}
                    value={formatMoney(total.expenses, total.currency, locale)}
                    tone="negative"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          {t("companies.detail.transactions")}
        </h2>
        {transactions.items.length === 0 ? (
          <FinanceEmptyState>
            {t("companies.detail.noTransactions")}
          </FinanceEmptyState>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-border md:block">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("transactions.table.occurredAt")}</TableHead>
                    <TableHead className="w-36 text-right">
                      {t("transactions.table.amount")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.items.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link
                            href={localizePath(
                              `/finance/transactions/${transaction.id}`,
                              locale,
                            )}
                            className="font-medium hover:underline"
                          >
                            {transaction.description ??
                              formatFinanceDateTime(
                                transaction.occurredAt,
                                locale,
                              )}
                          </Link>
                          {transaction.status !== "POSTED" ? (
                            <FinanceStatusBadge
                              status={transaction.status}
                              label={t(
                                `enums.transactionStatuses.${transaction.status}`,
                              )}
                            />
                          ) : null}
                          {transaction.type !== "INCOME" &&
                          transaction.type !== "EXPENSE" ? (
                            <span className="text-xs text-muted-foreground">
                              {t(`enums.transactionTypes.${transaction.type}`)}
                            </span>
                          ) : null}
                        </div>
                        {transaction.description ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatFinanceDateTime(
                              transaction.occurredAt,
                              locale,
                            )}
                          </div>
                        ) : null}
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="grid gap-2 md:hidden">
              {transactions.items.map((transaction) => (
                <li key={transaction.id}>
                  <Link
                    href={localizePath(
                      `/finance/transactions/${transaction.id}`,
                      locale,
                    )}
                    className="flex min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-border bg-card px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {transaction.description ??
                          formatFinanceDateTime(transaction.occurredAt, locale)}
                      </div>
                      {transaction.description ||
                      transaction.status !== "POSTED" ||
                      (transaction.type !== "INCOME" &&
                        transaction.type !== "EXPENSE") ? (
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
                          {transaction.type !== "INCOME" &&
                          transaction.type !== "EXPENSE" ? (
                            <span>
                              {t(`enums.transactionTypes.${transaction.type}`)}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
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
                </li>
              ))}
            </ul>
          </>
        )}

        {totalPages > 1 ? (
          <nav
            className="flex items-center justify-end gap-2"
            aria-label={t("transactions.pagination.label")}
          >
            <Link
              href={companyPageHref(detailHref, period, Math.max(1, page - 1))}
              aria-disabled={page <= 1}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                page <= 1 && "pointer-events-none opacity-50",
              )}
            >
              {t("transactions.pagination.previous")}
            </Link>
            <span className="text-sm text-muted-foreground">
              {t("transactions.pagination.page", { page, totalPages })}
            </span>
            <Link
              href={companyPageHref(
                detailHref,
                period,
                Math.min(totalPages, page + 1),
              )}
              aria-disabled={page >= totalPages}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                page >= totalPages && "pointer-events-none opacity-50",
              )}
            >
              {t("transactions.pagination.next")}
            </Link>
          </nav>
        ) : null}
      </section>
    </main>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-border pb-3 last:border-0 last:pb-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{value}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  emphasis = false,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
  emphasis?: boolean;
}) {
  const Icon =
    tone === "positive"
      ? PlusIcon
      : tone === "negative"
        ? MinusIcon
        : EqualIcon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 border-b border-border p-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0",
        emphasis && "bg-muted/40",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted",
          tone === "positive" && "bg-success-subtle text-success",
          tone === "negative" && "bg-destructive/10 text-destructive",
          tone === "neutral" && "text-muted-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div
          className={cn(
            "mt-1 truncate text-lg font-semibold tabular-nums",
            emphasis && "text-xl",
            tone === "positive" && "text-success",
            tone === "negative" && "text-destructive",
          )}
          title={value}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function transactionListPath(
  company: Pick<v1.finance.Company, "businessLegalEntityId" | "counterpartyId">,
  page: number,
): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    types: "INCOME,EXPENSE",
  });
  if (company.businessLegalEntityId) {
    params.set("businessLegalEntityId", company.businessLegalEntityId);
  } else {
    params.set("counterpartyId", company.counterpartyId);
  }
  return `${v1.finance.ROUTES.transactions.list}?${params.toString()}`;
}

function companyPageHref(
  detailHref: string,
  period: v1.finance.CompanyActivityPeriod,
  page: number,
): string {
  return `${detailHref}?period=${period}&page=${page}`;
}

function companyPeriod(
  value: string | undefined,
): v1.finance.CompanyActivityPeriod {
  return v1.finance.COMPANY_ACTIVITY_PERIODS.includes(
    value as v1.finance.CompanyActivityPeriod,
  )
    ? (value as v1.finance.CompanyActivityPeriod)
    : "MONTH";
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function companyAddress(company: v1.finance.Company): string | null {
  const parts = [
    company.addressLine1,
    company.addressLine2,
    company.city,
    company.region,
    company.postalCode,
    company.countryCode,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : null;
}
