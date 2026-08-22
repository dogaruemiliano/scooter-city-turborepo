/**
 * Minor-unit conversion for the API/UI boundary.
 *
 * Every monetary value crossing the wire is an integer count of minor units
 * (`30000` = 300.00 RON). Humans type and read major units, so exactly two
 * places convert: the form that collects an amount, and the view that renders
 * one. Nothing in between ever sees a fractional value.
 *
 * Parsing goes through string digits rather than `parseFloat` — `19.99 * 100`
 * is `1998.9999999999998` in IEEE-754, and rounding that is how cent-level
 * drift gets into a ledger.
 */
import { MINOR_UNITS_PER_MAJOR } from "./finance.constants";

const MINOR_DIGITS = String(MINOR_UNITS_PER_MAJOR).length - 1;

/** Accepts `12`, `12.5`, `12,50`, `-12.50`, with optional spaces. */
const MAJOR_AMOUNT_PATTERN = /^(-?)(\d+)(?:[.,](\d+))?$/;

export class InvalidMoneyAmountError extends Error {
  constructor(readonly value: string) {
    super(`"${value}" is not a valid money amount.`);
    this.name = "InvalidMoneyAmountError";
  }
}

/**
 * Converts a human-entered major-unit amount to minor units.
 *
 * @throws {InvalidMoneyAmountError} when the text is not a number, or carries
 * more decimals than the currency has (silently rounding a user's input is
 * how you lose a leu and never find out).
 */
export function parseMajorToMinor(value: string): number {
  const normalized = value.trim().replace(/\s/g, "");
  const match = MAJOR_AMOUNT_PATTERN.exec(normalized);

  if (!match) {
    throw new InvalidMoneyAmountError(value);
  }

  const [, sign, whole, fraction = ""] = match;

  if (fraction.length > MINOR_DIGITS) {
    throw new InvalidMoneyAmountError(value);
  }

  const minor =
    Number(whole) * MINOR_UNITS_PER_MAJOR +
    Number(fraction.padEnd(MINOR_DIGITS, "0"));

  return sign === "-" ? -minor : minor;
}

/** True when the text parses as a money amount. */
export function isValidMajorAmount(value: string): boolean {
  try {
    parseMajorToMinor(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts minor units to a plain major-unit string such as `"-300.05"`.
 * Locale-aware display formatting belongs in the UI layer; this is the
 * canonical machine-readable form.
 */
export function formatMinorToMajor(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  const whole = Math.trunc(absolute / MINOR_UNITS_PER_MAJOR);
  const fraction = absolute % MINOR_UNITS_PER_MAJOR;

  return `${sign}${whole}.${String(fraction).padStart(MINOR_DIGITS, "0")}`;
}
