/**
 * Canonical comparison/storage form for tax identifiers used by finance.
 * Romanian numeric CUIs treat the conventional RO prefix as optional.
 */
export function normalizeTaxIdentifier(
  value: string | null | undefined,
): string | null {
  const normalized = value?.toUpperCase().replace(/[^A-Z0-9]/gu, "") ?? "";
  if (!normalized) return null;
  return /^RO\d+$/u.test(normalized) ? normalized.slice(2) : normalized;
}
