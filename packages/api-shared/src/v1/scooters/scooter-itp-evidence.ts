import { dateOnlyToday } from "../common/common.schemas";
import {
  scooterDocumentExtractedDataSchema,
  type ScooterDocumentInspection,
} from "./scooter-document-extraction.schemas";

export interface ScooterItpEvidenceDocument {
  id: string;
  fileName?: string;
  extractedData?: unknown;
  version?: "original" | "client_copy";
}
export interface ScooterItpEvidenceSource {
  documentId: string;
  logicalDocumentId: string;
  type: "itp_card" | "itp_certificate";
  fileName: string;
  inspectionIndex: number;
  reading: ScooterDocumentInspection;
}
export type ScooterItpEvidence = ScooterDocumentInspection & {
  sources: ScooterItpEvidenceSource[];
  conflicts: boolean;
};

// A certificate may append a second database identifier after the register
// reference. Ignore punctuation/line wrapping, never substitute OCR characters.
function registerReference(value: string | null): string | null {
  return (
    value
      ?.split("/")[0]
      ?.toUpperCase()
      .replace(/[^A-Z0-9]/g, "") || null
  );
}

/** Reconcile independent readings without changing the original AI evidence. */
export function scooterItpEvidence(
  documents: readonly ScooterItpEvidenceDocument[],
  today = dateOnlyToday(),
): ScooterItpEvidence[] {
  const rows: ScooterItpEvidence[] = documents.flatMap((document) => {
    if (document.version === "client_copy") return [];
    const parsed = scooterDocumentExtractedDataSchema.safeParse(
      document.extractedData,
    );
    if (!parsed.success || parsed.data.clientCopy) return [];
    return (parsed.data.documents ?? []).flatMap((logical) => {
      const type = logical.documentType;
      if (type !== "itp_card" && type !== "itp_certificate") return [];
      // A recognized but unreadable card still belongs to its lone companion
      // certificate. Keep an unknown row so an explicit manual correction can
      // retain both links, without inventing any dates or result.
      const inspections = logical.inspections?.length
        ? logical.inspections
        : type === "itp_card"
          ? [
              {
                inspectionDate: null,
                validUntil: null,
                result: null,
                certificateNumber: null,
                odometerKm: null,
                rawFields: {},
              },
            ]
          : [];
      return inspections
        .map((reading, inspectionIndex) => ({
          ...reading,
          conflicts:
            Boolean(
              reading.inspectionDate &&
              reading.validUntil &&
              reading.validUntil < reading.inspectionDate,
            ) ||
            Boolean(
              logical.issues?.some(
                (issue) =>
                  ["inspectionDate", "validUntil", "result"].some(
                    (field) =>
                      issue.field === `inspections.${inspectionIndex}.${field}`,
                  ) &&
                  ["conflictingValues", "invalidValue"].includes(issue.code),
              ),
            ),
          sources: [
            {
              documentId: document.id,
              logicalDocumentId: logical.id,
              type,
              fileName: document.fileName ?? document.id,
              inspectionIndex,
              reading,
            },
          ],
        }))
        .filter((row) => !row.inspectionDate || row.inspectionDate <= today);
    });
  });
  const cards = rows.filter((row) => row.sources[0]!.type === "itp_card");
  const certificates = rows.filter(
    (row) => row.sources[0]!.type === "itp_certificate",
  );
  const matches = (
    certificate: ScooterItpEvidence,
    card: ScooterItpEvidence,
  ) => {
    const a = registerReference(certificate.certificateNumber);
    const b = registerReference(card.certificateNumber);
    if (a && b) return a === b;
    if (certificate.inspectionDate && card.inspectionDate)
      return certificate.inspectionDate === card.inspectionDate;
    // Same-scooter uploads with exactly one row each are unambiguous only if
    // neither supplies a contradictory reference/date. Never select the furthest expiry.
    return certificates.length === 1 && cards.length === 1;
  };
  const used = new Set<ScooterItpEvidence>();
  const result = certificates.map((certificate) => {
    const candidates = cards.filter((card) => matches(certificate, card));
    const card = candidates.length === 1 ? candidates[0] : undefined;
    if (
      !card ||
      certificates.filter((other) => matches(other, card)).length !== 1
    )
      return certificate;
    used.add(card);
    let conflicts = certificate.conflicts || card.conflicts;
    const merge = <K extends "inspectionDate" | "validUntil" | "odometerKm">(
      key: K,
    ) => {
      if (
        certificate[key] != null &&
        card[key] != null &&
        certificate[key] !== card[key]
      ) {
        conflicts = true;
        return null;
      }
      return certificate[key] ?? card[key];
    };
    const inspectionDate = merge("inspectionDate");
    const validUntil = merge("validUntil");
    const odometerKm = merge("odometerKm");
    const knownResults = new Set(
      [certificate.result, card.result].filter(
        (value) => value === "passed" || value === "failed",
      ),
    );
    if (knownResults.size > 1) conflicts = true;
    if (inspectionDate && validUntil && validUntil < inspectionDate)
      conflicts = true;
    return {
      ...certificate,
      inspectionDate,
      validUntil,
      odometerKm,
      result: knownResults.has("failed")
        ? ("failed" as const)
        : knownResults.has("passed")
          ? ("passed" as const)
          : ("unknown" as const),
      conflicts,
      sources: [...certificate.sources, ...card.sources],
    };
  });
  return [...result, ...cards.filter((card) => !used.has(card))].sort((a, b) =>
    (b.inspectionDate ?? "").localeCompare(a.inspectionDate ?? ""),
  );
}

/** Undated, unmatched rows remain unresolved; they cannot silently replace history. */
export function latestScooterItpEvidence(rows: readonly ScooterItpEvidence[]) {
  const latest = rows
    .map((row) => row.inspectionDate ?? "")
    .sort()
    .at(-1);
  return rows.filter(
    (row) =>
      row.inspectionDate === latest ||
      (!row.inspectionDate &&
        (!latest || !row.validUntil || row.validUntil >= latest)),
  );
}

export function scooterItpEvidenceConflicts(
  rows: readonly ScooterItpEvidence[],
) {
  const known = (key: "validUntil" | "result") =>
    new Set(
      rows
        .map((row) => row[key])
        .filter((value) => value != null && value !== "unknown"),
    );
  return (
    (rows.length > 1 && rows.some((row) => !row.inspectionDate)) ||
    rows.some((row) => row.conflicts) ||
    known("validUntil").size > 1 ||
    known("result").size > 1
  );
}
