/** Physical uploads may contain several of these logical document types. */
export const SCOOTER_DOCUMENT_TYPES = [
  "import_document",
  "civ",
  "registration_certificate",
  "insurance",
  "foreign_registration",
  "export_certificate",
  "itp_card",
  "itp_certificate",
  "ownership_proof",
  "other",
] as const;

/** Handwritten registration cards and yellow ITP cards are not reliable VIN sources. */
export function scooterDocumentReadsVin(type: string): boolean {
  return (
    type !== "registration_certificate" &&
    type !== "itp_card" &&
    type !== "other"
  );
}

export function scooterDocumentVinPriority(type: string): number {
  return [
    "civ",
    "insurance",
    "export_certificate",
    "foreign_registration",
  ].indexOf(type) < 0
    ? 4
    : [
        "civ",
        "insurance",
        "export_certificate",
        "foreign_registration",
      ].indexOf(type);
}

export function preferredScooterDocumentVin(
  documents: readonly { documentType: string; vin: string | null }[],
): string | null {
  return (
    [...documents]
      .filter(
        (document) =>
          scooterDocumentReadsVin(document.documentType) &&
          document.vin &&
          /^[A-HJ-NPR-Z0-9]{17}$/.test(document.vin),
      )
      .sort(
        (left, right) =>
          scooterDocumentVinPriority(left.documentType) -
          scooterDocumentVinPriority(right.documentType),
      )[0]?.vin ?? null
  );
}
