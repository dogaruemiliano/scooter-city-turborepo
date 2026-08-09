import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { requireFinanceAdmin } from "../../_lib/server";
import { CompanyForm } from "../_components/CompanyForm";

const COMPANIES_PATH = "/finance/companies";
const COMPANIES_NEW_PATH = "/finance/companies/new";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = resolveRouteLocale((await params).locale);
  return { title: messages[locale].finance.companies.form.createTitle };
}

export default async function NewCompanyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveRouteLocale((await params).locale);
  await requireFinanceAdmin(locale, COMPANIES_NEW_PATH);

  return (
    <main className="flex w-full flex-1 flex-col">
      <CompanyForm cancelHref={localizePath(COMPANIES_PATH, locale)} />
    </main>
  );
}
