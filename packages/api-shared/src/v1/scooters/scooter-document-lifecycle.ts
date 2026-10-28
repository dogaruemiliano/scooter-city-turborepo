import { dateOnlySchema, dateOnlyToday } from "../common/common.schemas";
import { scooterDocumentExtractedDataSchema } from "./scooter-document-extraction.schemas";
import type { ScooterDocumentType } from "./scooter-documents.schemas";

export const SCOOTER_DOCUMENT_DISPLAY_ORDER: readonly ScooterDocumentType[] = [
  "civ",
  "registration_certificate",
  "insurance",
  "itp_certificate",
  "itp_card",
  "import_document",
  "foreign_registration",
  "export_certificate",
  "ownership_proof",
  "other",
];
export const SCOOTER_CLIENT_DOCUMENT_TYPES = [
  "civ",
  "registration_certificate",
  "insurance",
  "itp_certificate",
  "itp_card",
] as const;
export type ScooterDocumentBadge = "expired" | "next" | "newest";
export interface ScooterDocumentEvidence {
  id: string;
  type: string | null;
  extractedData?: unknown;
  createdAt?: string;
  validFrom?: string | null;
  validUntil?: string | null;
  clientCopy?: unknown;
  version?: "original" | "client_copy";
}
function date(value: unknown): string | null {
  const parsed = dateOnlySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function scooterDocumentTypes(
  document: Pick<ScooterDocumentEvidence, "type" | "extractedData">,
): string[] {
  const parsed = scooterDocumentExtractedDataSchema.safeParse(
    document.extractedData,
  );
  return parsed.success && parsed.data.documents?.length
    ? [...new Set(parsed.data.documents.map((entry) => entry.documentType))]
    : document.type
      ? [document.type]
      : [];
}
export function scooterDocumentValidity(
  document: ScooterDocumentEvidence,
  type = document.type,
) {
  const parsed = scooterDocumentExtractedDataSchema.safeParse(
    document.extractedData,
  );
  const evidence = parsed.success ? parsed.data : null;
  const reading =
    evidence?.documents?.find((entry) => entry.documentType === type) ??
    evidence;
  const inspections =
    reading && "inspections" in reading ? reading.inspections : undefined;
  const inspection = inspections
    ?.slice()
    .sort((a, b) =>
      (b.inspectionDate ?? "").localeCompare(a.inspectionDate ?? ""),
    )[0];
  return {
    validFrom:
      date(document.validFrom) ??
      date(inspection?.inspectionDate) ??
      date(reading?.fields.validFrom),
    validUntil:
      date(document.validUntil) ??
      date(inspection?.validUntil) ??
      date(reading?.fields.validUntil),
  };
}
export function scooterDocumentState(
  document: ScooterDocumentEvidence,
  today = dateOnlyToday(),
  type = document.type,
): "current" | "expired" | "future" | "unknown" {
  if (!["insurance", "itp_card", "itp_certificate"].includes(type ?? ""))
    return "current";
  const { validFrom, validUntil } = scooterDocumentValidity(document, type);
  if (!validUntil || (validFrom && validUntil < validFrom)) return "unknown";
  if (validUntil < today) return "expired";
  if (!validFrom) return "unknown";
  return validFrom > today ? "future" : "current";
}
/** A lone expired record keeps its slot; replaced records move behind every type. */
export function scooterDocumentDisplayEntries<
  T extends ScooterDocumentEvidence,
>(documents: readonly T[], today = dateOnlyToday()) {
  const entries = documents.flatMap((document) => {
    const types = scooterDocumentTypes(document);
    return (types.length ? types : [null]).flatMap((type) =>
      (document.version === "client_copy"
        ? [true]
        : [false, ...(document.clientCopy ? [true] : [])]
      ).map((clientCopy) => ({
        document,
        type,
        clientCopy,
        badge: undefined as ScooterDocumentBadge | undefined,
        archived: false,
      })),
    );
  });
  for (const entry of entries) {
    const siblings = entries.filter(
      (other) =>
        other.type === entry.type && other.clientCopy === entry.clientCopy,
    );
    const state = scooterDocumentState(entry.document, today, entry.type);
    entry.archived =
      state === "expired" &&
      siblings.some(
        (other) =>
          scooterDocumentState(other.document, today, other.type) === "current",
      );
    if (state === "expired") entry.badge = "expired";
    else if (state === "future") entry.badge = "next";
    else if (
      state === "current" &&
      ["insurance", "itp_certificate", "itp_card"].includes(entry.type ?? "")
    ) {
      const current = siblings.filter(
        (other) =>
          scooterDocumentState(other.document, today, other.type) === "current",
      );
      const newest = current
        .slice()
        .sort(
          (a, b) =>
            (
              scooterDocumentValidity(b.document, b.type).validFrom ?? ""
            ).localeCompare(
              scooterDocumentValidity(a.document, a.type).validFrom ?? "",
            ) ||
            (b.document.createdAt ?? "").localeCompare(
              a.document.createdAt ?? "",
            ),
        )[0];
      if (current.length > 1 && newest === entry) entry.badge = "newest";
    }
  }
  const rank = (entry: (typeof entries)[number]) => {
    const index = SCOOTER_DOCUMENT_DISPLAY_ORDER.indexOf(
      entry.type as ScooterDocumentType,
    );
    return (
      (index < 0 ? SCOOTER_DOCUMENT_DISPLAY_ORDER.length : index) * 2 +
      Number(entry.clientCopy)
    );
  };
  const stateRank = (entry: (typeof entries)[number]) =>
    ({ current: 0, unknown: 1, future: 2, expired: 3 })[
      scooterDocumentState(entry.document, today, entry.type)
    ];
  return entries.sort(
    (a, b) =>
      Number(a.archived) - Number(b.archived) ||
      rank(a) - rank(b) ||
      stateRank(a) - stateRank(b),
  );
}
export function scooterItpDocumentsDue(
  validUntil?: string | null,
  today = dateOnlyToday(),
): boolean {
  if (!validUntil) return false;
  const warning = new Date(`${today}T00:00:00Z`);
  warning.setUTCDate(warning.getUTCDate() + 30);
  return validUntil <= warning.toISOString().slice(0, 10);
}
export function missingScooterClientDocuments(
  documents: readonly ScooterDocumentEvidence[],
  itpRequired: boolean,
  today = dateOnlyToday(),
): string[] {
  return SCOOTER_CLIENT_DOCUMENT_TYPES.filter(
    (type) =>
      (itpRequired || !type.startsWith("itp_")) &&
      !documents.some(
        (document) =>
          document.clientCopy &&
          scooterDocumentTypes(document).includes(type) &&
          scooterDocumentState(document, today, type) === "current",
      ),
  );
}
