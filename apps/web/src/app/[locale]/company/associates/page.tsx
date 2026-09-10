import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { resolveRouteLocale } from "@/i18n/paths";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinanceSuperAdmin,
} from "../../finance/_lib/finance-server";
import { COMPANY_PATHS } from "../_lib/links";
import { CompanyAssociatesForm } from "./_components/CompanyAssociatesForm";

interface CompanyAssociatesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: CompanyAssociatesPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  return { title: messages[locale].finance.associates.title };
}

export default async function CompanyAssociatesPage({
  params,
}: CompanyAssociatesPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const path = COMPANY_PATHS.associates;
  await requireFinanceSuperAdmin(locale, path);
  const associates = await fetchFinance(
    locale,
    path,
    v1.finance.ROUTES.companyAssociates,
    v1.finance.companyAssociatesSchema,
    await financeCookieHeader(),
  );

  return <CompanyAssociatesForm initialAssociates={associates} />;
}
