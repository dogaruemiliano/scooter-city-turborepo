function compactTaxIdentifier(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(CODFISCAL|CUI|CIF|VAT|CF)/, "");
}

/**
 * Canonical comparison form for supplier CIF/VAT numbers.
 *
 * Romanian documents commonly omit or include the `RO` VAT prefix for the
 * same company, so it is excluded from the uniqueness key. Other country
 * prefixes remain significant because identical numbers may exist in two
 * jurisdictions.
 */
export function normalizeSupplierTaxIdentifier(value: string): string {
  return compactTaxIdentifier(value).replace(/^RO(?=\d)/, "");
}

export function normalizeSupplierName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return normalized
    .replace(/\bS R L\b/g, "SRL")
    .replace(/\bS A\b/g, "SA")
    .replace(/\bP F A\b/g, "PFA")
    .replace(/\bI I\b/g, "II");
}

/** A leading ISO-style country prefix marks the CIF as a VAT identifier. */
export function supplierTaxIdentifierHasCountryPrefix(value: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]/.test(compactTaxIdentifier(value));
}
