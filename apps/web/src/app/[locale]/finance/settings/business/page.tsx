import { messages } from "@repo/i18n";
import type { Metadata } from "next";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import {
  financeCookieHeader,
  handleFinanceApiErrors,
  requireFinanceAdmin,
} from "../../_lib/server";
import { loadBusinessSetupBootstrap } from "../../expenses/_lib/expense-server";
import { BusinessSetupForm } from "./_components/BusinessSetupForm";

const BUSINESS_SETTINGS_PATH = "/finance/settings/business";
const NEW_EXPENSE_PATH = "/finance/expenses/new";

interface BusinessSettingsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: BusinessSettingsPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  return { title: messages[locale].finance.expenses.businessSetup.title };
}

export default async function BusinessSettingsPage({
  params,
}: BusinessSettingsPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  await requireFinanceAdmin(locale, BUSINESS_SETTINGS_PATH);
  const cookieHeader = await financeCookieHeader();
  const bootstrap = await handleFinanceApiErrors(
    locale,
    BUSINESS_SETTINGS_PATH,
    () =>
      loadBusinessSetupBootstrap({
        cookieHeader,
        today: new Date().toISOString().slice(0, 10),
      }),
  );

  return (
    <BusinessSetupForm
      bootstrap={bootstrap}
      newExpenseHref={localizePath(NEW_EXPENSE_PATH, locale)}
    />
  );
}
