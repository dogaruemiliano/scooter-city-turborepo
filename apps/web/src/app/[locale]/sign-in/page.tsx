import { PageLayout } from "@repo/ui/components/page-layout";
import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

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

export async function generateMetadata({
  params,
}: Pick<SignInPageProps, "params">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return {
    title: messages[locale].auth.signIn.title,
  };
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

  const { methods } = await loadEnabledMethods();

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  return (
    <PageLayout
      width="full"
      paddingTop="none"
      className="relative flex-row items-start justify-center pt-24 pb-[calc(var(--spacing-screen-bottom)+env(safe-area-inset-bottom))] sm:pt-28"
    >
      <LanguageSwitcher className="absolute top-4 right-4 z-raised sm:top-6 sm:right-6" />

      <div className="flex w-full max-w-md flex-col gap-6">
        <SignInMethods
          enabledMethods={methods}
          googleClientId={googleClientId}
        />
      </div>
    </PageLayout>
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
