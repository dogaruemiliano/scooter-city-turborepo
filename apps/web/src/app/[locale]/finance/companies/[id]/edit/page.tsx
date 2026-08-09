import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import {
  financeCookieHeader,
  handleFinanceApiErrors,
  requireFinanceAdmin,
} from "../../../_lib/server";
import { CompanyForm } from "../../_components/CompanyForm";

const COMPANIES_PATH = "/finance/companies";

interface EditCompanyPageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({
  params,
}: EditCompanyPageProps): Promise<Metadata> {
  const locale = resolveRouteLocale((await params).locale);
  return { title: messages[locale].finance.companies.form.editTitle };
}

export default async function EditCompanyPage({
  params,
}: EditCompanyPageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const routePath = `${COMPANIES_PATH}/${encodeURIComponent(id)}/edit`;
  await requireFinanceAdmin(locale, routePath);

  const cookie = await financeCookieHeader();
  const company = await handleFinanceApiErrors(
    locale,
    routePath,
    () =>
      webApi.fetch(
        v1.finance.ROUTES.companies.get(id),
        v1.finance.companySchema,
        { headers: { cookie }, cache: "no-store" },
      ),
    { notFoundOn404: true },
  );

  return (
    <main className="flex w-full flex-1 flex-col">
      <CompanyForm
        company={company}
        cancelHref={localizePath(
          `${COMPANIES_PATH}/${encodeURIComponent(id)}`,
          locale,
        )}
      />
    </main>
  );
}
