export const EXPENSE_BUSINESS_TIME_ZONE = "Europe/Bucharest";

export function expenseToday(
  now = new Date(),
  timeZone = EXPENSE_BUSINESS_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");

  if (!year || !month || !day) {
    throw new Error("Could not resolve the expense business date.");
  }

  return `${year}-${month}-${day}`;
}
