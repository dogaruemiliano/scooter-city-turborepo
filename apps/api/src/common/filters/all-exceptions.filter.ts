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
 * - `HttpException` → preserves status, derives a SCREAMING_SNAKE code from
 *   the status text. If the response body already has a `message` array
 *   (typical ValidationPipe output), it lands in `error.details`.
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
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

function codeForStatus(status: number): string {
  return (
    HttpStatus[status] ?? (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR')
  )
    .toString()
    .toUpperCase();
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const obj = body as { message?: unknown; error?: unknown };
        if (Array.isArray(obj.message)) {
          message =
            typeof obj.error === 'string' ? obj.error : 'Validation failed';
          details = obj.message;
        } else if (typeof obj.message === 'string') {
          message = obj.message;
        }
      }
    } else if (exception instanceof Error) {
      message =
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
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
