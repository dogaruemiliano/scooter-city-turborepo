import "server-only";

import { ApiError } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ZodType } from "zod";

import { getLocalizedSignInPath, localizePath } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import { meFromApi } from "@/lib/auth-server";
import { canAccess } from "@/lib/access";

export async function requireFinancePermission(
  locale: SupportedLocale,
  returnPath: string,
  permission: string,
) {
  return requireFinanceAccess(locale, returnPath, permission);
}

export async function requireFinanceSuperAdmin(
  locale: SupportedLocale,
  returnPath: string,
) {
  return requireFinanceAccess(locale, returnPath);
}

async function requireFinanceAccess(
  locale: SupportedLocale,
  returnPath: string,
  action?: string,
) {
  const user = await meFromApi();
  if (!user)
    redirect(getLocalizedSignInPath(locale, localizePath(returnPath, locale)));
  if (action ? !canAccess(user, action) : !user.isSuperAdmin) notFound();
  return user;
}

export async function financeCookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

/**
 * Fetches and validates a finance resource, mapping auth failures onto the
 * navigation the user actually needs: sign-in for 401, not-found for 403/404.
 */
export async function fetchFinance<T>(
  locale: SupportedLocale,
  returnPath: string,
  path: string,
  schema: ZodType<T>,
  cookieHeader: string,
): Promise<T> {
  try {
    return await webApi.fetch(path, schema, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(
        getLocalizedSignInPath(locale, localizePath(returnPath, locale)),
      );
    }

    if (
      error instanceof ApiError &&
      (error.status === 403 || error.status === 404)
    ) {
      notFound();
    }

    throw error;
  }
}
