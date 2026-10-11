/** No grouping or exponent notation: ambiguous pasted numbers stay invalid. */
export function parseDecimalInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(trimmed)
    ? Number(trimmed.replace(",", "."))
    : Number.NaN;
}

export function decimalSeparator(locale: string): string {
  return new Intl.NumberFormat(locale)
    .formatToParts(1.1)
    .find((part) => part.type === "decimal")!.value;
}

export function formatDecimalInput(value: string, locale: string): string {
  return value.replace(/[.,]/g, decimalSeparator(locale));
}
