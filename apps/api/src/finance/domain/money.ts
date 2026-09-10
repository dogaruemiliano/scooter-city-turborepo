/**
 * Integer money arithmetic for the ledger.
 *
 * Every value here is a count of minor units. There is no `number` in this
 * module that represents a fraction of a leu, and no division that can
 * produce one — {@link splitByBasisPoints} distributes remainders explicitly
 * instead of rounding, so a split always adds back up to the original total.
 */
import { v1 } from "@repo/api-shared";

import { FinanceValidationError } from "./finance.errors";

const TOTAL_BASIS_POINTS = v1.finance.TOTAL_SHARE_BASIS_POINTS;

export interface BasisPointShare {
  associateId: string;
  shareBasisPoints: number;
}

export interface AssociateAmount {
  associateId: string;
  amountMinor: number;
}

/** Sums minor-unit amounts. Empty input is zero, not `NaN`. */
export function sumMinor(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/** Sums the `amountMinor` field of a list of lines. */
export function sumAmountMinor(
  lines: ReadonlyArray<{ amountMinor: number }>,
): number {
  return sumMinor(lines.map((line) => line.amountMinor));
}

/**
 * Groups amounts per associate, preserving first-seen order so output is
 * deterministic regardless of how the caller assembled its input.
 */
export function groupByAssociate(
  amounts: readonly AssociateAmount[],
): AssociateAmount[] {
  const totals = new Map<string, number>();

  for (const { associateId, amountMinor } of amounts) {
    totals.set(associateId, (totals.get(associateId) ?? 0) + amountMinor);
  }

  return [...totals].map(([associateId, amountMinor]) => ({
    associateId,
    amountMinor,
  }));
}

/**
 * Splits `totalMinor` across ownership shares using the largest-remainder
 * method, so the parts sum to exactly `totalMinor` with no leftover unit.
 *
 * Plain rounding does not work here: three equal shares of 100 bani round to
 * 33 + 33 + 33 and lose a ban, which would leave a settlement that can never
 * balance to zero. Instead every share takes its floor, then the leftover
 * units go one each to the shares with the largest discarded remainder.
 * Ties break on `associateId` so the same input always produces the same
 * split — a settlement recalculated tomorrow must match the one shown today.
 *
 * @param totalMinor Non-negative total to distribute.
 * @param shares Ownership shares; must total exactly 10,000 basis points.
 */
export function splitByBasisPoints(
  totalMinor: number,
  shares: readonly BasisPointShare[],
): AssociateAmount[] {
  if (shares.length === 0) {
    throw new FinanceValidationError(
      "Cannot split an amount without any ownership shares.",
    );
  }

  const totalBasisPoints = sumMinor(
    shares.map((share) => share.shareBasisPoints),
  );

  if (totalBasisPoints !== TOTAL_BASIS_POINTS) {
    throw new FinanceValidationError(
      `Active ownership shares must total ${TOTAL_BASIS_POINTS} basis points but total ${totalBasisPoints}.`,
      { totalBasisPoints },
    );
  }

  if (totalMinor < 0) {
    throw new FinanceValidationError(
      "Cannot split a negative amount across ownership shares.",
      { totalMinor },
    );
  }

  const parts = shares.map((share) => {
    const exact = totalMinor * share.shareBasisPoints;

    return {
      associateId: share.associateId,
      amountMinor: Math.floor(exact / TOTAL_BASIS_POINTS),
      remainder: exact % TOTAL_BASIS_POINTS,
    };
  });

  let leftover = totalMinor - sumAmountMinor(parts);

  const byRemainder = [...parts].sort(
    (left, right) =>
      right.remainder - left.remainder ||
      left.associateId.localeCompare(right.associateId),
  );

  for (const part of byRemainder) {
    if (leftover <= 0) break;
    part.amountMinor += 1;
    leftover -= 1;
  }

  return parts.map(({ associateId, amountMinor }) => ({
    associateId,
    amountMinor,
  }));
}

/**
 * Guards a value that must be a positive whole number of minor units.
 * The database enforces the same rule; this exists so the caller gets a
 * sentence rather than a constraint-violation stack trace.
 */
export function assertPositiveAmount(
  amountMinor: number,
  subject: string,
): void {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new FinanceValidationError(
      `${subject} must be a positive whole number of minor units.`,
      { amountMinor },
    );
  }
}
