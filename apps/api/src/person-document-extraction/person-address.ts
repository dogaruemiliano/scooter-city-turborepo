import { v1 } from "@repo/api-shared";
import { capitalizeExtractedName } from "./person-name";

type Suggestion = v1.persons.PersonDocumentExtractionSuggestion;

/** Split printed Romanian administrative labels while retaining source metadata. */
export function normalizePersonAddressSuggestions(
  suggestions: Suggestion[],
  documentType: v1.persons.PersonDocumentType,
): Suggestion[] {
  const countries = suggestions.filter(
    (item) => item.target === "person" && item.field === "countryCode",
  );
  const addressIsRomanian = countries.length
    ? countries.every((item) => item.value.trim().toUpperCase() === "RO")
    : documentType === "nationalId" &&
      !suggestions.some(
        (item) =>
          item.field === "issuingCountryCode" &&
          item.value.trim().toUpperCase() !== "RO",
      );
  return suggestions.flatMap((item): Suggestion[] => {
    if (
      item.target !== "person" ||
      !["region", "city", "addressLine1", "addressLine2"].includes(item.field)
    )
      return [item];
    const hasRomanianCountyLabel = /(?:^|[\s,;])jud(?:\.|e[țţt])/iu.test(
      item.value,
    );
    if (
      !addressIsRomanian &&
      !(countries.length === 0 && hasRomanianCountyLabel)
    )
      return [item];

    const address = v1.persons.parseRomanianAddress(item.value);
    const result: Suggestion[] = [];
    if (item.field !== "region" && item.field !== "city") {
      result.push(item);
    } else if (item.field === "region" && !address.region) {
      result.push({ ...item, needsReview: true });
    } else if (item.field === "city" && !address.city) {
      result.push({ ...item, value: capitalizeExtractedName(item.value) });
    }
    if (address.region && (item.field !== "city" || address.city))
      result.push({ ...item, field: "region", value: address.region });
    if (address.city)
      result.push({
        ...item,
        field: "city",
        value: capitalizeExtractedName(address.city),
      });
    return result;
  });
}
