import type { DateBuildResult, DateParts } from "./types";

export function buildDateOnly(parts: DateParts): DateBuildResult {
  const hasDay = parts.day.length > 0;
  const hasMonth = parts.month.length > 0;
  const hasYear = parts.year.length > 0;

  if (!hasDay && !hasMonth && !hasYear) {
    return {};
  }

  if (!hasDay || !hasMonth || !hasYear) {
    return { error: "incomplete" };
  }

  if (parts.year.length !== 4) {
    return { error: "invalid" };
  }

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { error: "invalid" };
  }

  return {
    value: `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(
      2,
      "0",
    )}`,
  };
}

export function dateDigits(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export function emptyDateParts(): DateParts {
  return {
    day: "",
    month: "",
    year: "",
  };
}

export function hasDateParts(parts: DateParts): boolean {
  return (
    parts.day.length > 0 || parts.month.length > 0 || parts.year.length > 0
  );
}
