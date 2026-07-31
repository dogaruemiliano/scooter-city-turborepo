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
import { CompanyManager } from "./_components/CompanyManager";

const COMPANIES_PATH = "/finance/companies";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = resolveRouteLocale((await params).locale);
  return { title: messages[locale].finance.companies.title };
}

export default async function CompaniesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveRouteLocale((await params).locale);
  await requireFinanceAdmin(locale, COMPANIES_PATH);
  const cookie = await financeCookieHeader();
  const companies = await handleFinanceApiErrors(locale, COMPANIES_PATH, () =>
    webApi.fetch(
      `${v1.finance.ROUTES.companies.list}?page=1&pageSize=100`,
      v1.finance.companyListSchema,
      {
        headers: { cookie },
        cache: "no-store",
      },
    ),
  );
  const t = await getTranslations({ locale, namespace: "finance" });

  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <FinancePageHeader
        title={t("companies.title")}
        description={t("companies.description")}
      />
      <CompanyManager companies={companies.items} />
    </main>
  );
}
