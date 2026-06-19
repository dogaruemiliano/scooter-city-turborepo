import { v1 } from "@repo/api-shared";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "../../../components/LanguageSwitcher";
import { SignInMethods } from "../../../components/auth";
import {
  localizePath,
  resolveRouteLocale,
  safeNextPath,
} from "../../../i18n/paths";
import { webApi } from "../../../lib/api";
import { meOnServer } from "../../../lib/auth-server";

interface SignInPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}

/**
 * Sign-in landing. Lists every enabled auth method (gated by the API's
 * `/enabled-methods` endpoint, cached 1h via Next's data cache).
 *
 * If the user is already signed in, redirect to `next` (or the locale root).
 */
export default async function SignInPage({
  params,
  searchParams,
}: SignInPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const { next } = await searchParams;
  const destination = safeNextPath(next, localizePath("/", locale));
  const existing = await meOnServer();
  if (existing) redirect(destination);

  const t = await getTranslations({ locale, namespace: "auth.signIn" });
  const { methods } = await loadEnabledMethods();

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  return (
    <main className="flex w-full flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </header>

        <LanguageSwitcher />

        <SignInMethods
          enabledMethods={methods}
          googleClientId={googleClientId}
        />
      </div>
    </main>
  );
}

async function loadEnabledMethods(): Promise<v1.auth.EnabledAuthMethods> {
  try {
    return await webApi.fetch(
      v1.auth.ROUTES.enabledMethods,
      v1.auth.enabledAuthMethodsSchema,
      { next: { revalidate: 3600 } },
    );
  } catch {
    return { methods: [] };
  }
}
