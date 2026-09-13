/** Normalize printed all-caps/lowercase names while preserving mixed-case names. */
export function capitalizeExtractedName(value: string): string {
  return value.trim().replace(/\p{L}[\p{L}\p{M}]*/gu, (word) => {
    const lower = word.toLocaleLowerCase("ro");
    const upper = word.toLocaleUpperCase("ro");
    const normalized = word === upper || word === lower ? lower : word;
    return normalized.charAt(0).toLocaleUpperCase("ro") + normalized.slice(1);
  });
}
