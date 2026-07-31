import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import {
  financeCookieHeader,
  handleFinanceApiErrors,
  requireFinanceAdmin,
} from "../_lib/server";
import { TransactionsPage } from "./_components/TransactionsPage";

const TRANSACTIONS_PATH = "/finance/transactions";
const PAGE_SIZE = 25;

interface TransactionsRoutePageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: Pick<TransactionsRoutePageProps, "params">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return { title: messages[locale].finance.transactions.title };
}

export default async function TransactionsRoutePage({
  params,
  searchParams,
}: TransactionsRoutePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const filters = transactionFilters(await searchParams);
  const query = transactionQuery(filters);
  await requireFinanceAdmin(locale, TRANSACTIONS_PATH);
  const cookieHeader = await financeCookieHeader();
  const list = await handleFinanceApiErrors(locale, TRANSACTIONS_PATH, () =>
    webApi.fetch(
      transactionsListPath(query),
      v1.finance.moneyTransactionListSchema,
      {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      },
    ),
  );
  const transactionsHref = localizePath(TRANSACTIONS_PATH, locale);

  return (
    <TransactionsPage
      filters={filters}
      list={list}
      locale={locale}
      newTransactionHref={localizePath(`${TRANSACTIONS_PATH}/new`, locale)}
      transactionsHref={transactionsHref}
    />
  );
}

export interface TransactionListFilters {
  page: number;
  status?: v1.finance.MoneyTransactionStatus;
  type?: v1.finance.MoneyTransactionType;
  financialScope?: v1.finance.MoneyTransactionScope;
  paymentMethod?: v1.finance.PaymentMethod;
  billingStatus?: v1.finance.BillingStatus;
  from?: string;
  to?: string;
}

function transactionFilters(
  searchParams: Record<string, string | string[] | undefined>,
): TransactionListFilters {
  const from = dateOnly(firstSearchParam(searchParams.from));
  const to = dateOnly(firstSearchParam(searchParams.to));
  const validRange = !from || !to || from <= to;

  return {
    page: positiveInteger(firstSearchParam(searchParams.page)) ?? 1,
    status: enumValue(
      v1.finance.moneyTransactionStatusSchema,
      firstSearchParam(searchParams.status),
    ),
    type: enumValue(
      v1.finance.moneyTransactionTypeSchema,
      firstSearchParam(searchParams.type),
    ),
    financialScope: enumValue(
      v1.finance.moneyTransactionScopeSchema,
      firstSearchParam(searchParams.financialScope),
    ),
    paymentMethod: enumValue(
      v1.finance.paymentMethodSchema,
      firstSearchParam(searchParams.paymentMethod),
    ),
    billingStatus: enumValue(
      v1.finance.billingStatusSchema,
      firstSearchParam(searchParams.billingStatus),
    ),
    from: validRange ? from : undefined,
    to: validRange ? to : undefined,
  };
}

function transactionQuery(
  filters: TransactionListFilters,
): v1.finance.ListMoneyTransactionsQuery {
  const from = filters.from ? startOfUtcDay(filters.from) : undefined;
  const to = filters.to ? startOfNextUtcDay(filters.to) : undefined;
  const validRange = !from || !to || Date.parse(from) < Date.parse(to);
  const parsed = v1.finance.listMoneyTransactionsQuerySchema.safeParse({
    page: filters.page,
    pageSize: PAGE_SIZE,
    status: filters.status,
    type: filters.type,
    financialScope: filters.financialScope,
    paymentMethod: filters.paymentMethod,
    billingStatus: filters.billingStatus,
    from: validRange ? from : undefined,
    to: validRange ? to : undefined,
  });

  return parsed.success
    ? parsed.data
    : v1.finance.listMoneyTransactionsQuerySchema.parse({
        page: filters.page,
        pageSize: PAGE_SIZE,
      });
}

function transactionsListPath(
  query: v1.finance.ListMoneyTransactionsQuery,
): string {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.status) params.set("status", query.status);
  if (query.type) params.set("type", query.type);
  if (query.financialScope) {
    params.set("financialScope", query.financialScope);
  }
  if (query.paymentMethod) params.set("paymentMethod", query.paymentMethod);
  if (query.billingStatus) params.set("billingStatus", query.billingStatus);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  return `${v1.finance.ROUTES.transactions.list}?${params}`;
}

function enumValue<Output>(
  schema: {
    safeParse(
      value: unknown,
    ): { success: true; data: Output } | { success: false };
  },
  value: string | undefined,
): Output | undefined {
  if (!value) return undefined;
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

function positiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function dateOnly(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().startsWith(value) ? value : undefined;
}

function startOfUtcDay(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function startOfNextUtcDay(date: string): string {
  const next = new Date(startOfUtcDay(date));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
