import type { v1 } from "@repo/api-shared";

export interface DocumentVersionCandidate {
  id: string;
  file: { name: string };
  version?: "original" | "client_copy";
  versionSource?: "filename" | "branded_overlay" | "manual";
  originalId?: string;
  type: v1.scooters.ScooterDocumentType | null;
}
type Evidence = Record<
  string,
  v1.scooters.ScooterDocumentExtractedData | null | undefined
>;

// Deliberately exclude plain "copy" and download counters: duplicating a file
// does not establish that it is protected for client distribution.
const copyMarker =
  /\b(?:client(?:[\s_-]+copy)?|cop(?:y|ie)[\s_-]+(?:(?:for|pentru)[\s_-]+)?client|pentru[\s_-]+client|watermark(?:ed)?|cu[\s_-]+logo|protected|protejat[ăa]?)\b/giu;
function stem(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ");
}
export function hasClientCopyFileName(name: string): boolean {
  return Boolean(stem(name).match(copyMarker));
}
function family(name: string): string {
  return stem(name)
    .replace(copyMarker, " ")
    .replace(/\b(?:original|originala)\b/gu, " ")
    .replace(/\(\d+\)$/u, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
function normalize(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim().toUpperCase().replace(/\s+/g, " ")
    : "";
}
function readings(candidate: DocumentVersionCandidate, evidence: Evidence) {
  const data = evidence[candidate.id];
  return data?.documents?.length
    ? data.documents
    : data && candidate.type
      ? [{ ...data, documentType: candidate.type }]
      : [];
}
function identifiers(
  candidate: DocumentVersionCandidate,
  evidence: Evidence,
): string[] {
  return readings(candidate, evidence)
    .flatMap((doc) => {
      const key = (
        {
          civ: "civNumber",
          registration_certificate: "registrationCertificateNumber",
          foreign_registration: "foreignRegistrationCertificateNumber",
          export_certificate: "exportCertificateNumber",
        } as Record<string, string>
      )[doc.documentType];
      if (key && normalize(doc.fields[key]))
        return [`${doc.documentType}:${normalize(doc.fields[key])}`];
      if (
        doc.documentType === "insurance" &&
        doc.vin &&
        doc.fields.validFrom &&
        doc.fields.validUntil &&
        doc.fields.insuredName &&
        doc.fields.premiumAmount !== null &&
        doc.fields.premiumAmount !== undefined &&
        doc.fields.currency
      )
        return [
          `insurance:${doc.vin}:${normalize(doc.fields.validFrom)}:${normalize(doc.fields.validUntil)}:${normalize(doc.fields.insuredName)}:${normalize(doc.fields.premiumAmount)}:${normalize(doc.fields.currency)}`,
        ];
      if ("inspections" in doc && doc.inspections?.length) {
        const inspections = doc.inspections.flatMap((inspection) =>
          inspection.certificateNumber
            ? [normalize(inspection.certificateNumber)]
            : [],
        );
        if (inspections.length === doc.inspections.length)
          return [`${doc.documentType}:${inspections.sort().join("|")}`];
      }
      return [];
    })
    .sort();
}
function matches(
  copy: DocumentVersionCandidate,
  original: DocumentVersionCandidate,
  evidence: Evidence,
): boolean {
  const left = readings(copy, evidence),
    right = readings(original, evidence);
  const vins = new Set(
    [...left, ...right].flatMap((doc) => (doc.vin ? [doc.vin] : [])),
  );
  if (vins.size > 1) return false;
  const types = (items: typeof left) =>
    [...new Set(items.map((doc) => doc.documentType))].sort().join("|");
  if (left.length && right.length && types(left) !== types(right)) return false;
  const copyIds = identifiers(copy, evidence),
    originalIds = identifiers(original, evidence);
  if (copyIds.length && originalIds.length) {
    if (JSON.stringify(copyIds) !== JSON.stringify(originalIds)) return false;
    if (copyIds.length === left.length && originalIds.length === right.length)
      return true;
  }
  return (
    hasClientCopyFileName(copy.file.name) &&
    Boolean(family(copy.file.name)) &&
    family(copy.file.name) === family(original.file.name)
  );
}

/** Infer protection separately from pairing; ambiguity must never select an original by order. */
export function resolveDocumentVersions<T extends DocumentVersionCandidate>(
  drafts: T[],
  evidence: Evidence,
): T[] {
  const classified = drafts.map((draft) => {
    if (
      draft.versionSource === "manual" ||
      (!draft.versionSource &&
        draft.version === "client_copy" &&
        draft.originalId)
    )
      return { ...draft, type: draft.type ?? drafts.find((original) => original.id === draft.originalId)?.type ?? null };
    const source = evidence[draft.id]?.clientCopy
      ? ("branded_overlay" as const)
      : hasClientCopyFileName(draft.file.name)
        ? ("filename" as const)
        : draft.versionSource;
    if (!source) return draft; // Preserve explicitly supplied legacy copy links.
    return {
      ...draft,
      version: "client_copy" as const,
      versionSource: source,
      originalId: undefined,
    };
  });
  const originals = classified.filter(
    (draft) => draft.version !== "client_copy",
  );
  const copies = classified.filter(
    (draft) => draft.version === "client_copy" && !draft.originalId,
  );
  const reserved = new Set(
    classified.flatMap((draft) =>
      draft.version === "client_copy" && draft.originalId
        ? [draft.originalId]
        : [],
    ),
  );
  const candidates = new Map(
    copies.map((copy) => [
      copy.id,
      originals.filter(
        (original) =>
          !reserved.has(original.id) && matches(copy, original, evidence),
      ),
    ]),
  );
  return classified.map((draft) => {
    const possible = candidates.get(draft.id);
    if (possible?.length !== 1) return draft;
    const original = possible[0]!;
    if (
      copies.filter((copy) =>
        candidates.get(copy.id)?.some((item) => item.id === original.id),
      ).length !== 1
    )
      return draft;
    return { ...draft, type: original.type, originalId: original.id };
  });
}
