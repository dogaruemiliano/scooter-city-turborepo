import type { Request } from "express";

export interface RequestMetadata {
  ip: string | null;
  userAgent: string | null;
}

export function getRequestMetadata(req: Request): RequestMetadata {
  return {
    ip: req.ip ?? null,
    userAgent: req.header("user-agent") ?? null,
  };
}
