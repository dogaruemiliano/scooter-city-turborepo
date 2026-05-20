/**
 * Universal API fetch helper used by both web (server + client components)
 * and mobile. Pairs a route path with the Zod response schema so the
 * caller gets a validated, fully-typed response in one line.
 *
 * Usage:
 *
 *   import { v1, apiFetch } from "@repo/api-shared";
 *
 *   // GET, validated response
 *   const me = await apiFetch(v1.auth.ROUTES.me, v1.auth.sessionUserSchema);
 *
 *   // POST with JSON body
 *   const tokens = await apiFetch(
 *     v1.auth.ROUTES.emailOtp.verify,
 *     v1.auth.tokenPairSchema,
 *     { method: "POST", json: { email, code } },
 *   );
 *
 *   // 204 endpoint
 *   await apiFetch(v1.auth.ROUTES.logout, z.void(), { method: "POST" });
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
  /** Override the base URL. Defaults to `API_BASE_URL` or `NEXT_PUBLIC_API_URL` from env. */
  baseUrl?: string;
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

function resolveBaseUrl(): string {
  if (typeof process !== "undefined") {
    const fromNode =
      process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL;
    if (fromNode) return fromNode;
  }
  return "";
}

export async function apiFetch<T>(
  path: string,
  schema: ZodType<T>,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { json, body, baseUrl, headers, credentials, ...rest } = options;

  if (json !== undefined && body !== undefined) {
    throw new Error("apiFetch: pass either `json` or `body`, not both");
  }

  const base = baseUrl ?? resolveBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path}`;

  const finalHeaders = new Headers(headers);
  if (json !== undefined && !finalHeaders.has("content-type")) {
    finalHeaders.set("content-type", "application/json");
  }

  const res = await fetch(url, {
    ...rest,
    credentials: credentials ?? "include",
    headers: finalHeaders,
    body: json !== undefined ? JSON.stringify(json) : body,
  });

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
