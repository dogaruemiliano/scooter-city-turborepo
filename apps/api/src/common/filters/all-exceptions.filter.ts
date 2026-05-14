/**
 * Normalizes every thrown error into a single envelope:
 *
 * ```json
 * { "error": { "code": "BAD_REQUEST", "message": "...", "details": [...] } }
 * ```
 *
 * Reasoning: NestJS's default exception handling produces three different
 * shapes depending on which exception class was thrown. Orval-generated
 * clients want one shape. Without normalization the client error types
 * become useless union noise.
 *
 * Handling order:
 *
 * - `ZodValidationException` (from nestjs-zod) → 400 BAD_REQUEST with each
 *   ZodIssue mapped into `details[]`. Triggered by `ZodValidationPipe` on
 *   any request body / query / params that fails parsing.
 * - `ZodSerializationException` (from nestjs-zod) → 500 INTERNAL_SERVER_ERROR.
 *   Means the controller returned a value that doesn't satisfy its
 *   `@ZodSerializerDto` / `@ZodResponse` schema — a real bug. We log the
 *   underlying ZodError so the failure is debuggable, but never expose
 *   internals to the caller.
 * - `HttpException` (everything else from Nest) → preserves status,
 *   derives a SCREAMING_SNAKE code from the status text. If the response
 *   body already has a `message` array (typical legacy ValidationPipe
 *   output), it lands in `error.details`.
 * - Anything else → 500 INTERNAL_SERVER_ERROR with the message hidden in
 *   non-development environments.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodSerializationException, ZodValidationException } from "nestjs-zod";
import { ZodError } from "zod";

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

interface NormalizedIssue {
  path: string;
  code: string;
  message: string;
}

function codeForStatus(status: number): string {
  return (
    HttpStatus[status] ?? (status >= 500 ? "INTERNAL_SERVER_ERROR" : "ERROR")
  )
    .toString()
    .toUpperCase();
}

function isZodError(value: unknown): value is ZodError {
  // nestjs-zod stores the original error as `unknown`. We accept anything
  // shaped like a ZodError (has `issues`) — covers v3 and v4 schemas, plus
  // the case where someone manually throws ZodError outside a pipe.
  return (
    value instanceof ZodError ||
    (typeof value === "object" &&
      value !== null &&
      "issues" in value &&
      Array.isArray((value as { issues: unknown }).issues))
  );
}

function normalizeIssues(error: ZodError): NormalizedIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join("."),
    code: issue.code,
    message: issue.message,
  }));
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let details: unknown;

    if (exception instanceof ZodValidationException) {
      status = HttpStatus.BAD_REQUEST;
      message = "Validation failed";
      const zodError = exception.getZodError();
      if (isZodError(zodError)) {
        details = normalizeIssues(zodError);
      }
    } else if (exception instanceof ZodSerializationException) {
      // The handler returned data that doesn't satisfy its declared
      // response schema. The client gets a generic 500 — we don't leak
      // serialization details — but log the underlying error so the
      // shape mismatch is debuggable.
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = "Internal server error";
      const zodError = exception.getZodError();
      if (isZodError(zodError)) {
        this.logger.error(
          `ZodSerializationException: ${zodError.message}`,
          zodError.stack,
        );
      } else {
        this.logger.error(`ZodSerializationException: ${String(zodError)}`);
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
      } else if (body && typeof body === "object") {
        const obj = body as { message?: unknown; error?: unknown };
        if (Array.isArray(obj.message)) {
          message =
            typeof obj.error === "string" ? obj.error : "Validation failed";
          details = obj.message;
        } else if (typeof obj.message === "string") {
          message = obj.message;
        }
      }
    } else if (isZodError(exception)) {
      // Raw ZodError thrown outside any pipe (e.g. manual `.parse()` in
      // a service). Treat the same as ZodValidationException so callers
      // see a consistent envelope.
      status = HttpStatus.BAD_REQUEST;
      message = "Validation failed";
      details = normalizeIssues(exception);
    } else if (exception instanceof Error) {
      message =
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : exception.message;
      this.logger.error(exception.stack ?? exception.message);
    } else {
      this.logger.error(`Non-Error thrown: ${String(exception)}`);
    }

    const payload: ErrorResponse = {
      error: {
        code: codeForStatus(status),
        message,
        ...(details !== undefined ? { details } : {}),
        ...(req.id ? { requestId: req.id } : {}),
      },
    };

    res.status(status).json(payload);
  }
}
