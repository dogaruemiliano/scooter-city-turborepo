import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  getLocalizedSignInPath,
  localizePath,
  resolveRouteLocale,
} from "../../../../i18n/paths";
import { webApi } from "../../../../lib/api";
import { activeSessionsFromApi, meFromApi } from "../../../../lib/auth-server";
import { AccountSettings } from "./AccountSettings";

interface AccountSettingsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: AccountSettingsPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return {
    title: messages[locale].appShell.pages.accountSettings,
  };
}

export default async function AccountSettingsPage({
  params,
}: AccountSettingsPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const [user, sessions, enabledMethods] = await Promise.all([
    meFromApi(),
    activeSessionsFromApi(),
    webApi.fetch(
      v1.auth.ROUTES.enabledMethods,
      v1.auth.enabledAuthMethodsSchema,
      { cache: "no-store" },
    ),
  ]);

  if (!user || !sessions) {
    redirect(
      getLocalizedSignInPath(locale, localizePath("/account/settings", locale)),
    );
  }

  return (
    <AccountSettings
      initialUser={user}
      initialSessions={sessions}
      enabledMethods={enabledMethods.methods}
    />
  );
}
