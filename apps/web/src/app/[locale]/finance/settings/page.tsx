import { redirect } from "next/navigation";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { COMPANY_PATHS } from "../../company/_lib/links";

interface FinanceSettingsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function FinanceSettingsPage({
  params,
}: FinanceSettingsPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  redirect(localizePath(COMPANY_PATHS.settings, locale));
}
