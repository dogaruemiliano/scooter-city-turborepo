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
import { ClaimsTable } from "./_components/ClaimsTable";

const CLAIMS_PATH = "/finance/claims";

interface ClaimsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ClaimsPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  return { title: messages[locale].finance.claims.title };
}

export default async function ClaimsPage({ params }: ClaimsPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  await requireFinanceAdmin(locale, CLAIMS_PATH);
  const cookieHeader = await financeCookieHeader();
  const claims = await handleFinanceApiErrors(locale, CLAIMS_PATH, () =>
    webApi.fetch(
      v1.finance.ROUTES.claims.outstanding,
      v1.finance.outstandingPersonalClaimListSchema,
      {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      },
    ),
  );
  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <ClaimsTable locale={locale} claims={claims.items} />
    </main>
  );
}
