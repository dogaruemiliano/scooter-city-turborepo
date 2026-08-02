import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  getLocalizedSignInPath,
  localizePath,
  resolveRouteLocale,
} from "../../../../i18n/paths";
import { webApi } from "../../../../lib/api";
import { meFromApi } from "../../../../lib/auth-server";
import { PersonalWalletView } from "./_components/PersonalWalletView";

const PERSONAL_WALLET_PATH = "/account/wallet";

interface PersonalWalletPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: PersonalWalletPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return {
    title: messages[locale].appShell.pages.myWallet,
  };
}

export default async function PersonalWalletPage({
  params,
  searchParams,
}: PersonalWalletPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const [user, wallet] = await Promise.all([
    meFromApi(),
    personalWalletFromApi(),
  ]);

  if (!user || !wallet) {
    redirect(
      getLocalizedSignInPath(
        locale,
        localizePath(PERSONAL_WALLET_PATH, locale),
      ),
    );
  }

  const isAdmin = user.roles.includes("ADMIN");
  const page =
    positiveInteger(firstSearchParam((await searchParams).page)) ?? 1;
  const transactions = isAdmin
    ? await personalWalletTransactionsFromApi(wallet.id, page)
    : null;

  return (
    <PersonalWalletView
      locale={locale}
      transactions={transactions}
      wallet={wallet}
    />
  );
}

async function personalWalletFromApi(): Promise<v1.finance.Wallet | null> {
  const cookieHeader = (await cookies()).toString();

  if (!cookieHeader) {
    return null;
  }

  try {
    return await webApi.fetch(
      v1.finance.ROUTES.wallets.mine,
      v1.finance.walletSchema,
      {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

async function personalWalletTransactionsFromApi(
  walletId: string,
  page: number,
): Promise<v1.finance.MoneyTransactionList> {
  const cookieHeader = (await cookies()).toString();
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "50",
    status: "POSTED",
    walletId,
  });

  return webApi.fetch(
    `${v1.finance.ROUTES.transactions.list}?${params}`,
    v1.finance.moneyTransactionListSchema,
    {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    },
  );
}

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
