/**
 * Translates finance domain errors into HTTP exceptions.
 *
 * This is the only place the domain meets NestJS. Keeping the mapping here
 * means posting policies and settlement calculators stay plain TypeScript
 * that unit tests can call directly — and it keeps the status codes in one
 * readable table instead of scattered through use cases.
 *
 * An interceptor rather than an exception filter, because a filter has to
 * write the response itself. Rethrowing an `HttpException` from here lets
 * `AllExceptionsFilter` keep producing the single `{ error: { code, message,
 * details } }` envelope the whole API uses.
 */
import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, throwError } from "rxjs";
import { catchError } from "rxjs/operators";

import {
  FinanceError,
  FinanceNotFoundError,
  FinanceStateError,
  FinanceValidationError,
  IdempotencyConflictError,
  LedgerConfigurationError,
  UnbalancedJournalError,
} from "../domain/finance.errors";

/**
 * Validation failures are 422, not 400: the request parsed fine, it just
 * asks for something the books cannot represent. 400 stays reserved for
 * malformed bodies, which the zod pipe rejects before a use case runs.
 */
function statusFor(error: FinanceError): number {
  if (error instanceof FinanceNotFoundError) return HttpStatus.NOT_FOUND;
  if (error instanceof IdempotencyConflictError) return HttpStatus.CONFLICT;
  if (error instanceof FinanceStateError) return HttpStatus.CONFLICT;
  if (error instanceof FinanceValidationError) {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }

  // A missing or ambiguous ledger account, or an entry that does not
  // balance, is our bug or a bad setup — never the caller's fault.
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

@Injectable()
export class FinanceErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger(FinanceErrorInterceptor.name);

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          throwError(() =>
            error instanceof FinanceError ? this.toHttpException(error) : error,
          ),
        ),
      );
  }

  private toHttpException(error: FinanceError): HttpException {
    if (
      error instanceof LedgerConfigurationError ||
      error instanceof UnbalancedJournalError
    ) {
      this.logger.error(
        `${error.code}: ${error.message} ${JSON.stringify(error.details ?? {})}`,
        error.stack,
      );
    }

    return new HttpException(
      {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
      statusFor(error),
    );
  }
}
