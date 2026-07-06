export function toDateOnlyDate(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined || value === null) return value;
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateOnlyString(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}
