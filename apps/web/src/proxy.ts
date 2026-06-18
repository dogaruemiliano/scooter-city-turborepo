/**
 * Auth gate + stale-tab refresh.
 *
 * Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`
 * (and the exported function from `middleware` to `proxy`). Functionality
 * is unchanged — see https://nextjs.org/docs/app/api-reference/file-conventions/proxy.
 *
 *   1. If the user holds a valid access cookie → render.
 *   2. If on the public sign-in path → render.
 *   3. If holding only a refresh cookie → server-to-server POST
 *      /v1/auth/refresh with the request's cookie jar; forward the
 *      Set-Cookie back to the browser and render. This is the "tab
 *      was idle for >15min so access expired but refresh is still
 *      good" path — without it, every long-idle tab would redirect to
 *      /sign-in on first interaction.
 *   4. Otherwise → redirect to /sign-in?next=<original-path>.
 *
 * Access-cookie *validity* is verified by RSCs via `meOnServer()`
 * (JWKS local verify) — this proxy only checks for the cookie's
 * presence. That keeps it fast (no crypto, no network on the happy path).
 */
import { NextRequest, NextResponse } from "next/server";
import { v1 } from "@repo/api-shared";

import { webApi } from "./lib/api";

const PUBLIC_PATHS = ["/sign-in"];

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const access = req.cookies.get(v1.auth.ACCESS_TOKEN_COOKIE)?.value;
  const refresh = req.cookies.get(v1.auth.REFRESH_TOKEN_COOKIE)?.value;
  const isPublic = PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p));

  if (access) return NextResponse.next();
  if (isPublic) return NextResponse.next();

  if (!refresh) return redirectToSignIn(req);

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
    return redirectToSignIn(req);
  }

  if (!apiRes.ok) return redirectToSignIn(req);

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
  const res = NextResponse.next({ request: { headers: requestHeaders } });

  // Also persist the cookies in the browser for subsequent requests.
  for (const cookie of setCookies) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}

function redirectToSignIn(req: NextRequest): NextResponse {
  const url = new URL("/sign-in", req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals + favicon + .well-known. Sign-in is handled
  // inside the proxy body so it can still get the "already signed in →
  // redirect" treatment if we add it later.
  matcher: ["/((?!_next/|favicon.ico|.well-known/).*)"],
};
