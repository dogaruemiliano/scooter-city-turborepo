import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveRouteLocale } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import { FinancePageHeader } from "../_components/FinancePageHeader";
import {
  financeCookieHeader,
  handleFinanceApiErrors,
  requireFinanceAdmin,
} from "../_lib/server";
import { CreateWalletDialog } from "./_components/CreateWalletDialog";
import { WalletFilters } from "./_components/WalletFilters";
import { WalletList } from "./_components/WalletList";

const WALLETS_PATH = "/finance/wallets";

interface WalletsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: Pick<WalletsPageProps, "params">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  return { title: messages[locale].finance.wallets.title };
}

export default async function WalletsPage({
  params,
  searchParams,
}: WalletsPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const query = walletsQueryFromSearchParams(await searchParams);
  await requireFinanceAdmin(locale, WALLETS_PATH);
  const cookieHeader = await financeCookieHeader();
  const list = await handleFinanceApiErrors(locale, WALLETS_PATH, () =>
    webApi.fetch(walletsListPath(query), v1.finance.walletListSchema, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    }),
  );
  const t = await getTranslations({ locale, namespace: "finance" });

  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <FinancePageHeader
        title={t("wallets.title")}
        description={t("wallets.description")}
        action={<CreateWalletDialog />}
      />
      <WalletFilters locale={locale} query={query} />
      <WalletList locale={locale} list={list} query={query} />
    </main>
  );
}

function walletsQueryFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): v1.finance.ListWalletsQuery {
  const result = v1.finance.listWalletsQuerySchema.safeParse({
    page: firstSearchParam(searchParams.page),
    pageSize: firstSearchParam(searchParams.pageSize),
    search: firstSearchParam(searchParams.search),
    type: firstSearchParam(searchParams.type),
    ownerUserId: firstSearchParam(searchParams.ownerUserId),
    ownerRole: firstSearchParam(searchParams.ownerRole),
    ownerIsActive: firstSearchParam(searchParams.ownerIsActive),
    isActive: firstSearchParam(searchParams.isActive),
  });

  return result.success
    ? result.data
    : v1.finance.listWalletsQuerySchema.parse({});
}

function walletsListPath(query: v1.finance.ListWalletsQuery): string {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.search) params.set("search", query.search);
  if (query.type) params.set("type", query.type);
  if (query.ownerUserId) params.set("ownerUserId", query.ownerUserId);
  if (query.ownerRole) params.set("ownerRole", query.ownerRole);
  if (query.ownerIsActive !== undefined) {
    params.set("ownerIsActive", String(query.ownerIsActive));
  }
  if (query.isActive !== undefined) {
    params.set("isActive", String(query.isActive));
  }
  return `${v1.finance.ROUTES.wallets.list}?${params}`;
}

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
