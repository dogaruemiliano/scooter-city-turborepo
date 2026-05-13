/**
 * Attaches a request ID to every incoming HTTP request.
 *
 * - Honors an existing `x-request-id` header when present (so an upstream
 *   load balancer's trace ID propagates through).
 * - Otherwise generates a fresh UUID.
 * - Always echoes the value back via `X-Request-Id` response header.
 * - Stores it on `req.id` so `AllExceptionsFilter` and pino can correlate.
 */
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction): void {
    const incoming = req.header(REQUEST_ID_HEADER);
    const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
    req.id = id;
    res.setHeader("X-Request-Id", id);
    next();
  }
}
