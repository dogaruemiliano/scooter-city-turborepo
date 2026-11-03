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

/** All other types are classified and stored without reading their contents. */
export function scooterDocumentExtractsData(type: string): boolean {
  return ["civ", "insurance", "itp_certificate"].includes(type);
}

export function scooterDocumentReadsVin(type: string): boolean {
  return scooterDocumentExtractsData(type);
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
