import "server-only";

import { ApiError } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getLocalizedSignInPath, localizePath } from "@/i18n/paths";
import { meFromApi } from "@/lib/auth-server";

const ADMIN_ROLE = "ADMIN";

export async function requireFinanceAdmin(
  locale: SupportedLocale,
  returnPath: string,
) {
  const user = await meFromApi();

  if (!user) {
    redirect(getLocalizedSignInPath(locale, localizePath(returnPath, locale)));
  }

  if (!user.roles.includes(ADMIN_ROLE)) {
    notFound();
  }

  return user;
}

export async function financeCookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

export async function handleFinanceApiErrors<T>(
  locale: SupportedLocale,
  returnPath: string,
  operation: () => Promise<T>,
  options: { notFoundOn404?: boolean } = {},
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(
        getLocalizedSignInPath(locale, localizePath(returnPath, locale)),
      );
    }

    if (
      error instanceof ApiError &&
      (error.status === 403 ||
        (options.notFoundOn404 === true && error.status === 404))
    ) {
      notFound();
    }

    throw error;
  }
}
