/**
 * Hand-written `fetch` mutator that every Orval-generated operation
 * delegates to.
 *
 * The two non-default choices:
 *
 * - `credentials: "include"` — the API's auth cookies (HttpOnly access
 *   + refresh tokens, see [@repo/api-shared](../../api-shared/src/cookies.ts))
 *   are HttpOnly and JavaScript can't read them. Cross-origin browser
 *   requests need `credentials` to send the cookie at all; same-origin
 *   would technically work without it, but flipping the bit doesn't
 *   cost anything and the future cross-origin case works for free.
 *
 * - Response handling stays minimal: Orval's generated wrappers expect
 *   the resolved value to be the parsed JSON body (or `undefined` for
 *   204 responses). We throw on non-2xx so callers don't have to check
 *   `res.ok`; the surfaced `Error` has the normalized envelope from
 *   `AllExceptionsFilter` on its message.
 *
 * Signature is `(url, init)` to match Orval's fetch-client generator
 * output exactly. Orval-generated wrappers call
 * `customFetch(getXxxUrl(), { method: ..., body: ... })`.
 */

/**
 * Base URL for the API. Resolved at call time (not module load) so
 * tests / SSR can override `process.env.NEXT_PUBLIC_API_URL` between
 * mutator calls.
 */
function resolveBaseUrl(): string {
  if (typeof process !== "undefined") {
    const fromNode =
      process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL;
    if (fromNode) return fromNode;
  }
  return "";
}

export const customFetch = async <T>(
  url: string,
  init: RequestInit,
): Promise<T> => {
  const baseUrl = resolveBaseUrl();
  const requestUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;

  const response = await fetch(requestUrl, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });

  // 204 / 205 — no content; resolve with undefined.
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  let body: unknown;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await response.json();
  } else if (response.body) {
    body = await response.text();
  }

  if (!response.ok) {
    // The API's AllExceptionsFilter returns
    // `{ error: { code, message, details?, requestId? } }`.
    const envelope = body as
      | { error?: { code?: string; message?: string } }
      | undefined;
    const message =
      envelope?.error?.message ??
      `HTTP ${response.status} ${response.statusText}`;
    const error = new Error(message);
    Object.assign(error, {
      status: response.status,
      code: envelope?.error?.code,
      body,
    });
    throw error;
  }

  return body as T;
};

export default customFetch;
