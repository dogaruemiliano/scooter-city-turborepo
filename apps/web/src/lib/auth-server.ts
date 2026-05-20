import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, apiFetch, v1 } from "@repo/api-shared";

export type SessionUser = v1.auth.SessionUser;

export async function meOnServer(): Promise<SessionUser | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;

  try {
    return await apiFetch(v1.auth.ROUTES.me, v1.auth.sessionUserSchema, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const me = await meOnServer();
  if (!me) redirect("/sign-in");
  return me;
}
