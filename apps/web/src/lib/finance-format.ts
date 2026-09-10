/**
 * Display formatting for the finance UI.
 *
 * The API speaks in minor units — `30000` is 300.00 RON — and these are the
 * only functions that turn one into the other for display. Parsing in the
 * other direction lives in `@repo/api-shared` (`parseMajorToMinor`), so a
 * form and a table can never disagree about what "300,50" means.
 */
import { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";

const NUMBER_FORMAT_LOCALES = {
  en: "en-GB",
  ro: "ro-RO",
} as const satisfies Record<SupportedLocale, string>;

/** Formats an integer minor-unit amount as localized currency. */
export function formatMinorAmount(
  amountMinor: number,
  currency: string,
  locale: SupportedLocale,
): string {
  return new Intl.NumberFormat(NUMBER_FORMAT_LOCALES[locale], {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / v1.finance.MINOR_UNITS_PER_MAJOR);
}

/**
 * Formats an amount with an explicit sign, for impact figures where the
 * direction is the point: "−300,00 RON" of company cash.
 */
export function formatSignedMinorAmount(
  amountMinor: number,
  currency: string,
  locale: SupportedLocale,
): string {
  const formatted = formatMinorAmount(Math.abs(amountMinor), currency, locale);

  if (amountMinor === 0) return formatted;
  return amountMinor > 0 ? `+${formatted}` : `−${formatted}`;
}

/** Formats basis points as a percentage: `5000` → "50%". */
export function formatBasisPoints(
  basisPoints: number,
  locale: SupportedLocale,
): string {
  return new Intl.NumberFormat(NUMBER_FORMAT_LOCALES[locale], {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(basisPoints / v1.finance.TOTAL_SHARE_BASIS_POINTS);
}

export function formatFinanceDate(
  value: string,
  locale: SupportedLocale,
): string {
  return new Intl.DateTimeFormat(NUMBER_FORMAT_LOCALES[locale], {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatFinanceDateTime(
  value: string,
  locale: SupportedLocale,
): string {
  return new Intl.DateTimeFormat(NUMBER_FORMAT_LOCALES[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Falls back to the email when an associate has no name on record. */
export function financeUserLabel(user: {
  email: string;
  firstName: string | null;
  lastName: string | null;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}
