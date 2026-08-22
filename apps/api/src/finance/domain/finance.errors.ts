/**
 * Domain errors for the financial module.
 *
 * These are deliberately framework-free: the domain and application layers
 * throw them, and `FinanceExceptionFilter` is the single place that turns
 * them into HTTP responses. Keeping NestJS out of the domain is what lets
 * the posting policies and settlement calculators be tested as plain
 * functions with no test module to bootstrap.
 *
 * `code` is the stable machine-readable identifier clients switch on;
 * `message` is for humans and may be reworded freely.
 */

/** Base class for everything the finance domain rejects. */
export abstract class FinanceError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The caller sent something the domain cannot accept — amounts that do not
 * add up, an allocation missing its beneficiary, a transfer to the same
 * account. Maps to 422: the request was well-formed but the finances are not.
 */
export class FinanceValidationError extends FinanceError {
  readonly code = "FINANCE_VALIDATION_FAILED";
}

/** A referenced book, account, category, cost object, or operation is absent. */
export class FinanceNotFoundError extends FinanceError {
  readonly code = "FINANCE_NOT_FOUND";
}

/**
 * The books are set up wrong — a required ledger account is missing, or the
 * selector matched more than one. This is an operator problem, not a caller
 * problem, so it maps to 500 rather than 4xx.
 */
export class LedgerConfigurationError extends FinanceError {
  readonly code = "FINANCE_LEDGER_MISCONFIGURED";
}

/**
 * The operation cannot move in the direction requested — reversing an
 * already-reversed operation, or editing one that is posted.
 */
export class FinanceStateError extends FinanceError {
  readonly code = "FINANCE_INVALID_STATE";
}

/**
 * The same idempotency key was replayed with a materially different payload.
 * Maps to 409: the key already names a different operation.
 */
export class IdempotencyConflictError extends FinanceError {
  readonly code = "FINANCE_IDEMPOTENCY_CONFLICT";
}

/**
 * A journal entry whose lines do not sum to zero. This should be impossible
 * from outside — it means a posting policy has a bug — so it never carries
 * caller-supplied text.
 */
export class UnbalancedJournalError extends FinanceError {
  readonly code = "FINANCE_UNBALANCED_JOURNAL";

  constructor(imbalanceMinor: number, lineCount: number) {
    super(
      `Journal entry does not balance: ${lineCount} lines leave ${imbalanceMinor} minor units unaccounted for.`,
      { imbalanceMinor, lineCount },
    );
  }
}
