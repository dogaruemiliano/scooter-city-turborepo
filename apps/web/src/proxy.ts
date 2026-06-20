/**
 * Auth gate + stale-tab refresh.
 *
 * Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`
 * (and the exported function from `middleware` to `proxy`). Functionality
 * is unchanged — see https://nextjs.org/docs/app/api-reference/file-conventions/proxy.
 *
 *   1. If the user holds a valid access cookie → render.
 *   2. If holding only a refresh cookie → server-to-server POST
 *      /v1/auth/refresh with the request's cookie jar; forward the
 *      Set-Cookie back to the browser and render. This is the "tab
 *      was idle for >15min so access expired but refresh is still
 *      good" path — without it, every long-idle tab would redirect to
 *      /sign-in on first interaction.
 *   3. If on the public sign-in path with no refresh cookie → render
 *      through locale routing.
 *   4. Otherwise → redirect to the localized sign-in URL with
 *      ?next=<original-local-path>.
 *
 * Access-cookie *validity* is verified by RSCs via `meOnServer()`
 * (JWKS local verify) — this proxy only checks for the cookie's
 * presence. That keeps it fast (no crypto, no network on the happy path).
 */
import { NextRequest, NextResponse } from "next/server";
import { v1 } from "@repo/api-shared";
import createMiddleware from "next-intl/middleware";

import {
  getLocalizedSignInPath,
  getLocaleFromPathname,
  isPublicPathname,
  safeNextPath,
} from "./i18n/paths";
import { routing } from "./i18n/routing";
import { webApi } from "./lib/api";

const handleI18nRouting = createMiddleware(routing);

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const access = req.cookies.get(v1.auth.ACCESS_TOKEN_COOKIE)?.value;
  const refresh = req.cookies.get(v1.auth.REFRESH_TOKEN_COOKIE)?.value;
  const isPublic = isPublicPathname(req.nextUrl.pathname);

  if (access) return handleI18nRouting(req);

  if (!refresh) {
    return isPublic ? handleI18nRouting(req) : redirectToSignIn(req);
  }

  // Stale-tab refresh path.
  let apiRes: Response;
  try {
    apiRes = await fetch(webApi.url(v1.auth.ROUTES.refresh), {
      method: "POST",
      headers: {
        cookie: req.headers.get("cookie") ?? "",
        "x-requested-with": "fetch",
        "content-type": "application/json",
      },
      body: "{}",
    });
  } catch {
    return sessionTemporarilyUnavailable();
  }

  if (!apiRes.ok) {
    if (isRefreshAuthFailure(apiRes.status)) {
      return isPublic ? handleI18nRouting(req) : redirectToSignIn(req);
    }

    return sessionTemporarilyUnavailable();
  }

  const setCookies = apiRes.headers.getSetCookie();
  const requestCookies = new Map(
    req.cookies.getAll().map(({ name, value }) => [name, value]),
  );
  for (const cookie of setCookies) {
    const pair = cookie.split(";", 1)[0];
    const separator = pair?.indexOf("=") ?? -1;
    if (separator > 0) {
      requestCookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  // Forward the freshly issued cookies into the current render request.
  // Without this, Server Components still see the stale incoming cookie
  // jar and can redirect even though refresh succeeded.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(
    "cookie",
    [...requestCookies].map(([name, value]) => `${name}=${value}`).join("; "),
  );
  const res = handleI18nRouting(req);
  mergeRequestOverrides(res, requestHeaders);

  // Also persist the cookies in the browser for subsequent requests.
  for (const cookie of setCookies) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}

function redirectToSignIn(req: NextRequest): NextResponse {
  const locale = getLocaleFromPathname(req.nextUrl.pathname);
  const next = safeNextPath(`${req.nextUrl.pathname}${req.nextUrl.search}`);
  const url = new URL(getLocalizedSignInPath(locale, next), req.url);
  return NextResponse.redirect(url);
}

function isRefreshAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

function sessionTemporarilyUnavailable(): NextResponse {
  return new NextResponse(
    "Your session could not be checked because the authentication service is temporarily unavailable. Your browser session was not cleared. Retry when the API is back online.",
    {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
        "retry-after": "5",
      },
    },
  );
}

function mergeRequestOverrides(
  response: NextResponse,
  requestHeaders: Headers,
): void {
  const mergedHeaders = new Headers(requestHeaders);
  const existingOverrideHeaders =
    response.headers.get("x-middleware-override-headers") ?? "";

  for (const key of existingOverrideHeaders.split(",")) {
    const headerName = key.trim();
    if (headerName.length === 0) {
      continue;
    }

    const value = response.headers.get(`x-middleware-request-${headerName}`);
    if (value !== null) {
      mergedHeaders.set(headerName, value);
    }
  }

  const cookieHeader = requestHeaders.get("cookie");
  if (cookieHeader !== null) {
    mergedHeaders.set("cookie", cookieHeader);
  }

  const overrideResponse = NextResponse.next({
    request: { headers: mergedHeaders },
  });

  for (const [key, value] of overrideResponse.headers) {
    if (
      key === "x-middleware-override-headers" ||
      key.startsWith("x-middleware-request-")
    ) {
      response.headers.set(key, value);
    }
  }
}

export const config = {
  // Skip Next internals + public files + .well-known. Sign-in is handled
  // inside the proxy body so it can still get the "already signed in →
  // redirect" treatment if we add it later.
  matcher: ["/((?!api|trpc|_next|_vercel|favicon.ico|.well-known|.*\\..*).*)"],
};
