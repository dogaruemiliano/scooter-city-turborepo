import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, v1 } from "@repo/api-shared";
import { jwtVerify } from "jose";

import { webApi } from "./api";
import { JWKS } from "./jwks";
import type { SessionIdentity } from "./auth-types";

export type SessionUser = v1.auth.SessionUser;

/**
 * Verifies the `access_token` cookie locally against the API's JWKS and
 * returns the session derived from JWT claims. Fast (no network round-trip)
 * — suitable for the root layout and every protected page's gate check.
 *
 * Trade-off: detects token *invalidation* up to 15min late (the
 * `JWT_ACCESS_TTL`). Pages that need DB-fresh user fields (profile, billing,
 * just-changed email) should call `meFromApi()` instead.
 */
export async function meOnServer(): Promise<SessionIdentity | null> {
  const token = (await cookies()).get(v1.auth.ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWKS, { algorithms: ["RS256"] });
    const sub = payload.sub;
    const email = payload.email;
    if (
      payload.tokenType !== "access" ||
      typeof sub !== "string" ||
      typeof email !== "string"
    ) {
      return null;
    }
    return {
      id: sub,
      email,
      roles: Array.isArray(payload.roles)
        ? (payload.roles as unknown[]).filter(
            (r): r is string => typeof r === "string",
          )
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Round-trips `GET /v1/auth/me` for the authoritative DB row. Use on
 * pages where profile state must be fresh (settings, profile, anywhere
 * that just performed a mutation against the user record).
 */
export async function meFromApi(): Promise<SessionUser | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;

  try {
    return await webApi.fetch(v1.auth.ROUTES.me, v1.auth.sessionUserSchema, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function activeSessionsFromApi(): Promise<
  v1.auth.SessionSummary[] | null
> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;

  try {
    return await webApi.fetch(
      v1.auth.ROUTES.sessions.list,
      v1.auth.sessionSummarySchema.array(),
      {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function requireUser(): Promise<SessionIdentity> {
  const me = await meOnServer();
  if (!me) redirect("/sign-in");
  return me;
}
