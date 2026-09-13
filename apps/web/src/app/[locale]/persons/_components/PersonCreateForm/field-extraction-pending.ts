import { v1 } from "@repo/api-shared";
import type { ExtractionFieldKey, ExtractionState } from "./extraction-state";
import { hasKnownRomanianCountry } from "./form-state";

const ADDRESS_FIELDS = new Set([
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "countryCode",
]);
const PERSON_FIELDS = new Set<string>(
  v1.persons.PERSON_EXTRACTION_PERSON_FIELDS,
);
const DOCUMENT_FIELDS = new Set<string>(
  v1.persons.PERSON_EXTRACTION_DOCUMENT_FIELDS,
);

export function fieldHasPendingExtraction(
  state: ExtractionState,
  pendingDocumentKeys: ReadonlySet<string>,
  fieldKey: ExtractionFieldKey,
): boolean {
  if (hasKnownRomanianCountry(state.form, fieldKey)) return false;
  if (state.touched[fieldKey] || state.autofilled[fieldKey]) return false;

  return state.form.documents.some((document) => {
    if (!pendingDocumentKeys.has(document.key)) return false;
    if (fieldKey.startsWith("person.")) {
      const field = fieldKey.slice("person.".length);
      return (
        PERSON_FIELDS.has(field) &&
        !(
          ADDRESS_FIELDS.has(field) &&
          document.type === "nationalId" &&
          document.nationalIdFormat === "electronic"
        )
      );
    }
    const prefix = `document.${document.key}.`;
    if (!fieldKey.startsWith(prefix)) return false;
    const field = fieldKey.slice(prefix.length);
    if (field === "licenseCategories") return document.type === "driverLicense";
    if (field === "expiresOn" && !document.hasExpiryDate) return false;
    return DOCUMENT_FIELDS.has(field);
  });
}
