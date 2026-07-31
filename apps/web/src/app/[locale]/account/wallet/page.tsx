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

  return <PersonalWalletView locale={locale} wallet={wallet} />;
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
