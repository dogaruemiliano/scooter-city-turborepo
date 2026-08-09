import { randomUUID } from "node:crypto";

import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import {
  financeCookieHeader,
  handleFinanceApiErrors,
  requireFinanceAdmin,
} from "../../_lib/server";
import { TransactionDetailPage } from "../_components/TransactionDetailPage";

const TRANSACTIONS_PATH = "/finance/transactions";

interface TransactionDetailRoutePageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({
  params,
}: TransactionDetailRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return { title: messages[locale].finance.transactions.detail.title };
}

export default async function TransactionDetailRoutePage({
  params,
}: TransactionDetailRoutePageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const detailPath = `${TRANSACTIONS_PATH}/${encodeURIComponent(id)}`;
  await requireFinanceAdmin(locale, detailPath);
  const cookieHeader = await financeCookieHeader();
  const transaction = await handleFinanceApiErrors(
    locale,
    detailPath,
    () =>
      webApi.fetch(
        v1.finance.ROUTES.transactions.get(id),
        v1.finance.moneyTransactionSchema,
        {
          headers: { cookie: cookieHeader },
          cache: "no-store",
        },
      ),
    { notFoundOn404: true },
  );

  return (
    <TransactionDetailPage
      locale={locale}
      reverseIdempotencyKey={`web:reverse:${id}:${randomUUID()}`}
      transaction={transaction}
      transactionsHref={localizePath(TRANSACTIONS_PATH, locale)}
    />
  );
}
