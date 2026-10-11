import "server-only";
import { notFound, redirect } from "next/navigation";
import type { SupportedLocale } from "@repo/i18n";
import { getLocalizedSignInPath, localizePath } from "@/i18n/paths";
import { meFromApi } from "./auth-server";
import { canAccess } from "./access";

export async function requireAccess(
  locale: SupportedLocale,
  path: string,
  action?: string,
) {
  const user = await meFromApi();
  if (!user)
    redirect(getLocalizedSignInPath(locale, localizePath(path, locale)));
  if (action ? !canAccess(user, action) : !user.isSuperAdmin) notFound();
  return user;
}
