import type { Env } from "./env";

export function buildCorsOrigins(
  env: Pick<Env, "APP_BASE_URL" | "CORS_ORIGINS">,
): string[] {
  return uniqueOrigins([env.APP_BASE_URL, ...env.CORS_ORIGINS]);
}

function uniqueOrigins(values: string[]): string[] {
  return [...new Set(values.map(toOrigin))];
}

function toOrigin(value: string): string {
  return new URL(value).origin;
}
