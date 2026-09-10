import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { resolveRouteLocale } from "@/i18n/paths";
import { CompanyIdentityForm } from "../../finance/settings/_components/CompanyIdentityForm";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinanceSuperAdmin,
} from "../../finance/_lib/finance-server";
import { COMPANY_PATHS } from "../_lib/links";

interface CompanySettingsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: CompanySettingsPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  return { title: messages[locale].finance.settings.title };
}

export default async function CompanySettingsPage({
  params,
}: CompanySettingsPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const path = COMPANY_PATHS.settings;
  await requireFinanceSuperAdmin(locale, path);
  const cookieHeader = await financeCookieHeader();
  const identityResponse = await fetchFinance(
    locale,
    path,
    v1.finance.ROUTES.companyIdentity,
    v1.finance.financeLegalIdentityResponseSchema,
    cookieHeader,
  );

  return <CompanyIdentityForm identity={identityResponse.identity} />;
}
