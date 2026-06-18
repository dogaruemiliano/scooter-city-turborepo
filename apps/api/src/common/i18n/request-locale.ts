import type { Request } from "express";
import {
  fallbackLocale,
  resolveLocaleFromHeaders,
  type HeaderSource,
  type SupportedLocale,
} from "@repo/i18n";

type RequestWithHeaders = Pick<Request, "headers">;

export function getRequestLocale(req: RequestWithHeaders): SupportedLocale {
  return resolveLocaleFromHeaders(req.headers as HeaderSource, {
    fallback: fallbackLocale,
  });
}

