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
import { TransactionCreateForm } from "../_components/TransactionCreateForm";
import type { TransactionPrefill } from "../_lib/transaction-recipes";

const TRANSACTIONS_PATH = "/finance/transactions";
const NEW_TRANSACTION_PATH = "/finance/transactions/new";

interface NewTransactionPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: Pick<NewTransactionPageProps, "params">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return { title: messages[locale].finance.transactionForm.title };
}

export default async function NewTransactionPage({
  params,
  searchParams,
}: NewTransactionPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  await requireFinanceAdmin(locale, NEW_TRANSACTION_PATH);
  const cookieHeader = await financeCookieHeader();
  const [wallets, adminWallets, categoryList] = await handleFinanceApiErrors(
    locale,
    NEW_TRANSACTION_PATH,
    () =>
      Promise.all([
        allWalletOptions(cookieHeader),
        allWalletOptions(cookieHeader, { ownerRole: "ADMIN" }),
        webApi.fetch(
          v1.finance.ROUTES.categories.list,
          v1.finance.financialCategoryListSchema,
          {
            headers: { cookie: cookieHeader },
            cache: "no-store",
          },
        ),
      ]),
  );
  const prefill = restrictSettlementPrefill(
    transactionPrefill(await searchParams),
    adminWallets,
  );

  return (
    <TransactionCreateForm
      adminWalletIds={adminWallets.map((wallet) => wallet.id)}
      categories={categoryList.items}
      idempotencyKey={`web:create:${randomUUID()}`}
      prefill={prefill}
      transactionsHref={localizePath(TRANSACTIONS_PATH, locale)}
      wallets={wallets}
    />
  );
}

async function allWalletOptions(
  cookieHeader: string,
  filters: { ownerRole?: "ADMIN" } = {},
): Promise<v1.finance.WalletOption[]> {
  const items: v1.finance.WalletOption[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({
      pageSize: "100",
      isActive: "true",
    });
    if (filters.ownerRole) params.set("ownerRole", filters.ownerRole);
    if (cursor) params.set("cursor", cursor);

    const page = await webApi.fetch(
      `${v1.finance.ROUTES.walletOptions}?${params}`,
      v1.finance.walletOptionListSchema,
      {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      },
    );
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  return items;
}

function transactionPrefill(
  searchParams: Record<string, string | string[] | undefined>,
): TransactionPrefill {
  const type = v1.finance.creatableMoneyTransactionTypeSchema.safeParse(
    firstSearchParam(searchParams.type),
  );
  const amount = v1.finance.positiveMoneyAmountSchema.safeParse(
    firstSearchParam(searchParams.amount),
  );
  const currency = v1.finance.currencySchema.safeParse(
    firstSearchParam(searchParams.currency),
  );

  return {
    ...(type.success ? { type: type.data } : {}),
    ...(amount.success ? { amount: amount.data } : {}),
    ...(currency.success ? { currency: currency.data } : {}),
    debtorUserId: nonEmpty(firstSearchParam(searchParams.debtorUserId)),
    creditorUserId: nonEmpty(firstSearchParam(searchParams.creditorUserId)),
  };
}

function restrictSettlementPrefill(
  prefill: TransactionPrefill,
  adminWallets: readonly v1.finance.WalletOption[],
): TransactionPrefill {
  if (prefill.type !== "PERSONAL_FUNDS_SPLIT") return prefill;
  const adminOwnerIds = new Set(
    adminWallets.flatMap((wallet) => (wallet.owner ? [wallet.owner.id] : [])),
  );

  return {
    ...prefill,
    debtorUserId:
      prefill.debtorUserId && adminOwnerIds.has(prefill.debtorUserId)
        ? prefill.debtorUserId
        : undefined,
    creditorUserId:
      prefill.creditorUserId && adminOwnerIds.has(prefill.creditorUserId)
        ? prefill.creditorUserId
        : undefined,
  };
}

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
