/**
 * Universal API fetch helper used by both web (server + client components)
 * and mobile. Pairs a route path with the Zod response schema so the
 * caller gets a validated, fully-typed response in one line.
 *
 * Usage:
 *
 *   import { createApiClient, v1 } from "@repo/api-shared";
 *
 *   const api = createApiClient("https://api.example.com");
 *
 *   // GET, validated response
 *   const me = await api.fetch(v1.auth.ROUTES.me, v1.auth.sessionUserSchema);
 *
 *   // POST with JSON body
 *   const tokens = await api.fetch(
 *     v1.auth.ROUTES.emailOtp.verify,
 *     v1.auth.tokenPairSchema,
 *     { method: "POST", json: { challengeId, code } },
 *   );
 *
 *   // 204 endpoint
 *   await api.fetch(v1.auth.ROUTES.logout, z.void(), { method: "POST" });
 *
 * On the API's normalized error envelope `{ error: { code, message, ... } }`,
 * throws `ApiError` with `status`, `code`, and the original `details`.
 */
import type { ZodType } from "zod";

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  /** JSON body. Stringified and sets `content-type: application/json`. Mutually exclusive with `body`. */
  json?: unknown;
  /** Raw body (FormData, Blob, string). Use `json` for JSON payloads. */
  body?: BodyInit;
  /** Required for relative paths. Prefer binding it once with `createApiClient`. */
  baseUrl?: string;
  /**
   * Internal — set to `true` by the 401-retry path to prevent infinite
   * recursion. Callers should not set this.
   */
  _retried?: boolean;
}

/**
 * Per-runtime auth glue. Web installs a cookie-based adapter (Set-Cookie
 * updates browser state on refresh); mobile installs a Bearer-token
 * adapter (reads/writes SecureStore, sends `Authorization: Bearer`).
 *
 * `apiFetch` is intentionally runtime-neutral: it only knows about
 * `decorate` (mutate the outgoing request) and `refresh` (called once
 * on 401, returns true if the retry should proceed). Adapters own their
 * own singleflight and timeout semantics.
 */
export interface AuthAdapter {
  /** Mutate the outgoing request. Web no-ops; mobile adds Authorization header. */
  decorate?(init: RequestInit): RequestInit;
  /**
   * Invoked once on 401. Returns true if `apiFetch` should retry the call.
   * Implementation owns its own singleflight + timeout.
   */
  refresh(baseUrl: string): Promise<boolean>;
}

export interface ApiClient {
  /** Normalized HTTP(S) origin with no trailing slash. */
  readonly baseUrl: string;
  /** Resolve a relative API path against `baseUrl`. Absolute HTTP(S) URLs pass through. */
  url(path: string): string;
  /** Execute `apiFetch` with this client's normalized base URL. */
  fetch<T>(
    path: string,
    schema: ZodType<T>,
    options?: Omit<ApiFetchOptions, "baseUrl">,
  ): Promise<T>;
}

let adapter: AuthAdapter | null = null;
export function configureAuthAdapter(a: AuthAdapter | null): void {
  adapter = a;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(
    status: number,
    message: string,
    code?: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeApiBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) {
    throw new Error("API base URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("API base URL must be an absolute HTTP(S) URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("API base URL must use http: or https:");
  }
  if (parsed.username || parsed.password) {
    throw new Error("API base URL must not contain credentials");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("API base URL must not contain a query or fragment");
  }
  if (parsed.pathname !== "/") {
    throw new Error("API base URL must not contain a path");
  }

  return parsed.origin;
}

function resolveApiUrl(
  path: string,
  baseUrl?: string,
): { url: string; authBaseUrl: string } {
  let absolute: URL | null = null;
  try {
    absolute = new URL(path);
  } catch {
    // Relative paths are resolved below.
  }

  if (absolute) {
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") {
      throw new Error("apiFetch: absolute URLs must use http: or https:");
    }
    return {
      url: absolute.toString(),
      authBaseUrl: baseUrl ? normalizeApiBaseUrl(baseUrl) : absolute.origin,
    };
  }

  if (!baseUrl) {
    throw new Error(
      `apiFetch: relative path "${path}" requires options.baseUrl or createApiClient(baseUrl)`,
    );
  }
  if (!path.startsWith("/")) {
    throw new Error(`apiFetch: relative API paths must start with "/"`);
  }

  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  const resolvedUrl = new URL(path, `${normalizedBaseUrl}/`);
  if (resolvedUrl.origin !== normalizedBaseUrl) {
    throw new Error("apiFetch: relative API paths must stay on the API origin");
  }
  return {
    url: resolvedUrl.toString(),
    authBaseUrl: normalizedBaseUrl,
  };
}

export function createApiClient(baseUrl: string | undefined): ApiClient {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);

  return {
    baseUrl: normalizedBaseUrl,
    url(path) {
      return resolveApiUrl(path, normalizedBaseUrl).url;
    },
    fetch(path, schema, options = {}) {
      return apiFetch(path, schema, {
        ...options,
        baseUrl: normalizedBaseUrl,
      });
    },
  };
}

export async function apiFetch<T>(
  path: string,
  schema: ZodType<T>,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { json, body, baseUrl, headers, credentials, _retried, ...rest } =
    options;

  if (json !== undefined && body !== undefined) {
    throw new Error("apiFetch: pass either `json` or `body`, not both");
  }

  const resolved = resolveApiUrl(path, baseUrl);

  const finalHeaders = new Headers(headers);
  if (json !== undefined && !finalHeaders.has("content-type")) {
    finalHeaders.set("content-type", "application/json");
  }
  // Only cookie-authenticated mutations need the CSRF marker. Avoid adding
  // it to safe requests because a custom header forces a browser preflight.
  const method = (rest.method ?? "GET").toUpperCase();
  if (!SAFE_METHODS.has(method) && !finalHeaders.has("x-requested-with")) {
    finalHeaders.set("x-requested-with", "fetch");
  }

  const baseInit: RequestInit = {
    ...rest,
    credentials: credentials ?? "include",
    headers: finalHeaders,
    body: json !== undefined ? JSON.stringify(json) : body,
  };
  const init = adapter?.decorate ? adapter.decorate(baseInit) : baseInit;

  const res = await fetch(resolved.url, init);

  // 401 → run adapter.refresh() once, then retry. Skip the retry on the
  // refresh endpoint itself to avoid infinite recursion if refresh 401s.
  if (
    res.status === 401 &&
    !_retried &&
    adapter !== null &&
    !new URL(resolved.url).pathname.endsWith("/auth/refresh")
  ) {
    const refreshed = await adapter.refresh(resolved.authBaseUrl);
    if (refreshed) {
      return apiFetch(path, schema, { ...options, _retried: true });
    }
  }

  if (res.status === 204 || res.status === 205) {
    return schema.parse(undefined);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const responseBody: unknown = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const envelope = responseBody as ErrorEnvelope | undefined;
    throw new ApiError(
      res.status,
      envelope?.error?.message ?? `HTTP ${res.status} ${res.statusText}`,
      envelope?.error?.code,
      envelope?.error?.details,
    );
  }

  return schema.parse(responseBody);
}
