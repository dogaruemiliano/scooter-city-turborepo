/** Comparison only: retain the database name and original document reading. */
export function normalizeScooterBrandName(name: string): string {
  return name.replace(/\s+/gu, "").toUpperCase();
}
