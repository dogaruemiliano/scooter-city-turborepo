"use client";

import type { AuthAdapter } from "@repo/api-shared";

/**
 * Web `AuthAdapter`: cookie-based session refresh with module-level
 * singleflight + 5s timeout.
 *
 *   - `decorate` is omitted: the browser handles cookies natively via
 *     `credentials: "include"` on `webApi.fetch`.
 *   - `refresh` POSTs `/v1/auth/refresh` with an empty body; the API's
 *     `Set-Cookie` header silently updates the access cookie on the
 *     browser. We just need to know whether the call succeeded.
 *
 * Installed by `SessionProvider` on mount via `configureAuthAdapter()`.
 */
let inFlight: Promise<boolean> | null = null;

export const webAuthAdapter: AuthAdapter = {
  refresh(baseUrl: string): Promise<boolean> {
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        const res = await fetch(`${baseUrl}/v1/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: {
            "x-requested-with": "fetch",
            "content-type": "application/json",
          },
          body: "{}",
          signal: ctrl.signal,
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
        inFlight = null;
      }
    })();

    return inFlight;
  },
};
