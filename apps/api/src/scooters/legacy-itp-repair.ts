import { v1 } from "@repo/api-shared";

type LegacyScooter = {
  civIssuedAt: string | null;
  documents: { type: string; extractedData: unknown }[];
  inspections: {
    id: string;
    source: string;
    result: string;
    validUntil: string | null;
    inspectionDate: string | null;
    cardDocumentId: string | null;
    certificateDocumentId: string | null;
  }[];
};

/** Only recover explicit CIV dates. Registration/manufacture dates are never substitutes. */
export function legacyItpRepairPlan(
  scooter: LegacyScooter,
  today = v1.common.dateOnlyToday(),
) {
  const dates = new Set<string>();
  let invalid = false;
  for (const document of scooter.documents) {
    const parsed = v1.scooters.scooterDocumentExtractedDataSchema.safeParse(
      document.extractedData,
    );
    if (!parsed.success) continue;
    const fields = parsed.data.documents?.length
      ? parsed.data.documents
          .filter((entry) => entry.documentType === "civ")
          .map((entry) => entry.fields)
      : document.type === "civ"
        ? [parsed.data.fields]
        : [];
    for (const entry of fields) {
      const date = entry.civIssuedAt;
      if (!date) continue;
      if (
        typeof date !== "string" ||
        !v1.common.dateOnlySchema.safeParse(date).success ||
        date > today
      )
        invalid = true;
      else dates.add(date);
    }
  }
  const recovered = !invalid && dates.size === 1 ? [...dates][0] : null;
  const issuedAt = scooter.civIssuedAt ?? recovered;
  const inspection = scooter.inspections[0];
  // A lone date-only manual entry matching the initial validity can be repaired.
  // A failure, actual inspection, conflicting date, or history always needs review.
  const confirmInspectionId =
    issuedAt &&
    issuedAt <= today &&
    scooter.inspections.length === 1 &&
    inspection?.source === "manual" &&
    inspection.result === "unknown" &&
    !inspection.inspectionDate &&
    !inspection.cardDocumentId &&
    !inspection.certificateDocumentId &&
    inspection.validUntil === v1.scooters.initialScooterItpExpiry(issuedAt)
      ? inspection.id
      : null;
  return {
    civIssuedAt: !scooter.civIssuedAt ? recovered : null,
    confirmInspectionId,
    needsCivReview: !issuedAt,
    needsItpReview:
      inspection?.result === "unknown" && inspection.id !== confirmInspectionId,
    conflictingEvidence: invalid || dates.size > 1,
  };
}
