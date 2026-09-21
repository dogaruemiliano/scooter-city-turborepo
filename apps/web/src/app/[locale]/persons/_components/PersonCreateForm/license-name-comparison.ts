import type { ExtractionState } from "./extraction-state";

export interface LicenseNameDifference {
  field: "firstName" | "lastName";
  identityName: string;
  licenseName: string;
  formattingOnly: boolean;
  source: string;
}

function normalizeName(value: string) {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("ro")
    .trim()
    .replace(/\s+/gu, " ");
}

export function equivalentPersonNames(left: string, right: string) {
  // Normalize only for comparison; keep the identity document's original spelling.
  const normalize = (value: string) =>
    normalizeName(value.replace(/\p{Dash_Punctuation}/gu, " "))
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
  return normalize(left) === normalize(right);
}

export function licenseNameDifferences(
  state: ExtractionState,
): LicenseNameDifference[] {
  const differences: LicenseNameDifference[] = [];
  for (const document of state.form.documents) {
    if (document.type !== "driverLicense") continue;
    const reading = state.readings[document.key];
    if (!reading || reading.result.detectedDocumentType !== "driverLicense")
      continue;
    for (const suggestion of reading.result.suggestions) {
      if (
        suggestion.target !== "person" ||
        (suggestion.field !== "firstName" && suggestion.field !== "lastName")
      )
        continue;
      const identityName = state.form[suggestion.field].trim();
      const licenseName = suggestion.value.trim();
      if (
        !identityName ||
        !licenseName ||
        equivalentPersonNames(identityName, licenseName)
      )
        continue;
      if (
        differences.some(
          (entry) =>
            entry.field === suggestion.field &&
            entry.licenseName === licenseName,
        )
      )
        continue;
      differences.push({
        field: suggestion.field,
        identityName,
        licenseName,
        formattingOnly: equivalentPersonNames(identityName, licenseName),
        source: `${document.key}:${reading.sourceSignature}`,
      });
    }
  }
  return differences;
}
