import type { v1 } from "@repo/api-shared";
import type { AnalyzePersonDocumentInput } from "./person-document-extraction.types";

/** Keep Romanian ID series separate even when OCR returns the combined CEI field. */
export function normalizePersonDocumentIdentifiers(
  suggestions: v1.persons.PersonDocumentExtractionSuggestion[],
  input: AnalyzePersonDocumentInput,
): v1.persons.PersonDocumentExtractionSuggestion[] {
  const isRomanianId =
    input.documentType === "nationalId" &&
    (input.nationalIdFormat !== undefined ||
      suggestions.some(
        (item) =>
          item.target === "document" &&
          item.field === "issuingCountryCode" &&
          item.value.trim().toUpperCase() === "RO",
      ));
  if (!isRomanianId) return suggestions;

  return suggestions.flatMap((item) => {
    if (
      item.target !== "document" ||
      (item.field !== "series" && item.field !== "number")
    )
      return [item];

    const compact = item.value.replace(/\s/g, "").toUpperCase();
    if (item.field === "series" && /^[A-Z]{2}$/.test(compact))
      return [{ ...item, value: compact }];

    if (item.field === "number") {
      const combined = /^([A-Z]{2})(\d{6,7})$/.exec(compact);
      if (combined) {
        // Preserve source/review metadata on both parts. Existing conflict and
        // duplicate handling must also see any separately extracted series.
        return [
          { ...item, field: "series", value: combined[1] },
          { ...item, field: "number", value: combined[2] },
        ];
      }
      if (/^\d{6,7}$/.test(compact)) return [{ ...item, value: compact }];
    }
    return [item];
  });
}
