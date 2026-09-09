import "server-only";

import { ApiError, v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ZodType } from "zod";

import { getLocalizedSignInPath, localizePath } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import { meFromApi } from "@/lib/auth-server";

const ADMIN_ROLE = v1.auth.AUTH_ROLES.ADMIN;
const SUPER_ADMIN_ROLE = v1.auth.AUTH_ROLES.SUPER_ADMIN;

/**
 * The finance module is admin-only. Anyone else gets a 404 rather than a 403,
 * so the existence of the company's books is not confirmed to a signed-in
 * user who has no business seeing them.
 */
export async function requireFinanceAdmin(
  locale: SupportedLocale,
  returnPath: string,
) {
  return requireFinanceRole(locale, returnPath, ADMIN_ROLE);
}

export async function requireFinanceSuperAdmin(
  locale: SupportedLocale,
  returnPath: string,
) {
  return requireFinanceRole(locale, returnPath, SUPER_ADMIN_ROLE);
}

async function requireFinanceRole(
  locale: SupportedLocale,
  returnPath: string,
  role: string,
) {
  const user = await meFromApi();

  if (!user) {
    redirect(getLocalizedSignInPath(locale, localizePath(returnPath, locale)));
  }

  if (!user.roles.includes(role)) {
    notFound();
  }

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
