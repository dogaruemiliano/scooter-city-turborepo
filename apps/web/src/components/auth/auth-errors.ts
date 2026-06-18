import { ApiError } from "@repo/api-shared";

export function formatAuthError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback;
  return fallback;
}
