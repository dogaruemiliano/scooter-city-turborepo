import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { resolveRouteLocale } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import {
  financeCookieHeader,
  handleFinanceApiErrors,
  requireFinanceAdmin,
} from "../_lib/server";
import { OwnersTable } from "./_components/OwnersTable";

const OWNERS_PATH = "/finance/owners";

interface OwnersPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: OwnersPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  return { title: messages[locale].finance.owners.title };
}

export default async function OwnersPage({ params }: OwnersPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  await requireFinanceAdmin(locale, OWNERS_PATH);
  const cookieHeader = await financeCookieHeader();
  const balances = await handleFinanceApiErrors(locale, OWNERS_PATH, () =>
    webApi.fetch(
      v1.finance.ROUTES.owners.balances,
      v1.finance.ownerBalanceListSchema,
      {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      },
    ),
  );
  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <OwnersTable locale={locale} balances={balances.items} />
    </main>
  );
}
