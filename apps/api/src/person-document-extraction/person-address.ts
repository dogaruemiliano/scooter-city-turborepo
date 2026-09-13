import { v1 } from "@repo/api-shared";

type Suggestion = v1.persons.PersonDocumentExtractionSuggestion;

/** Resolve county/locality against the shared SIRUTA cities-and-communes dataset. */
export function normalizePersonAddressSuggestions(
  suggestions: Suggestion[],
  documentType: v1.persons.PersonDocumentType,
): Suggestion[] {
  const countries = suggestions.filter(
    (item) => item.target === "person" && item.field === "countryCode",
  );
  const addressIsRomanian = countries.length
    ? countries.every((item) => item.value.trim().toUpperCase() === "RO")
    : (documentType === "nationalId" &&
        !suggestions.some(
          (item) =>
            item.field === "issuingCountryCode" &&
            item.value.trim().toUpperCase() !== "RO",
        )) ||
      suggestions.some(
        (item) =>
          item.target === "person" &&
          /(?:^|[\s,;])jud(?:\.|e[țţt])/iu.test(item.value),
      );
  if (!addressIsRomanian) return suggestions;

  const addressSuggestions = suggestions.filter(
    (item) =>
      item.target === "person" &&
      ["region", "city", "addressLine1", "addressLine2"].includes(item.field),
  );
  const counties = addressSuggestions.flatMap((item) => {
    const region =
      item.field === "city"
        ? v1.persons.parseRomanianAddress(item.value).region
        : v1.persons.normalizeRomanianCounty(item.value);
    return region && v1.persons.ROMANIAN_COUNTIES.includes(region)
      ? [{ region, sourceSlot: item.sourceSlot }]
      : [];
  });
  function countyFor(item: Suggestion) {
    const sameSource = counties.filter(
      (county) => county.sourceSlot === item.sourceSlot,
    );
    return unique(
      (sameSource.length ? sameSource : counties).map(
        (county) => county.region,
      ),
    );
  }
  const parsed = addressSuggestions.map((item) => ({
    item,
    address: v1.persons.parseRomanianAddress(item.value, countyFor(item)),
  }));
  const normalized = suggestions.flatMap((item): Suggestion[] => {
    const entry = parsed.find((entry) => entry.item === item);
    if (!entry) return [item];
    const { address } = entry;
    const county = address.region ?? countyFor(item);
    const result: Suggestion[] = [];
    if (item.field === "city") {
      const city =
        address.city ??
        (county
          ? v1.persons.matchRomanianLocality(county, item.value)
          : undefined);
      if (city) {
        result.push({ ...item, value: city });
      } else {
        // A model may return a village as city. Prefer the explicitly printed
        // commune/city from that same image; the full address retains the village.
        const printedLocality = unique(
          parsed
            .filter(
              (entry) =>
                entry.item.sourceSlot === item.sourceSlot &&
                ["addressLine1", "addressLine2"].includes(entry.item.field),
            )
            .flatMap((entry) =>
              entry.address.city ? [entry.address.city] : [],
            ),
        );
        if (!printedLocality) result.push({ ...item, needsReview: true });
      }
    } else if (item.field === "addressLine1" || item.field === "addressLine2") {
      const lines = v1.persons.splitRomanianAddressLines(
        item.value,
        item.field === "addressLine1" ? 1 : 2,
      );
      if (lines.addressLine1)
        result.push({
          ...item,
          target: "person",
          field: "addressLine1",
          value: lines.addressLine1,
        });
      if (lines.addressLine2)
        result.push({
          ...item,
          target: "person",
          field: "addressLine2",
          value: lines.addressLine2,
        });
    } else if (!address.region) {
      result.push({ ...item, needsReview: true });
    }
    if (address.region && (item.field !== "city" || address.city))
      result.push({
        ...item,
        target: "person",
        field: "region",
        value: address.region,
      });
    if (address.city && item.field !== "city")
      result.push({
        ...item,
        target: "person",
        field: "city",
        value: address.city,
      });
    return result;
  });
  // The model may repeat line-2 details in both input lines. Merge details from
  // the same photo while retaining separate suggestions across different photos.
  const extras = new Map<string, Suggestion>();
  return normalized.filter((item) => {
    if (item.target !== "person" || item.field !== "addressLine2") return true;
    const previous = extras.get(item.sourceSlot);
    if (!previous) {
      extras.set(item.sourceSlot, item);
      return true;
    }
    previous.value = [
      ...new Set([...previous.value.split(", "), ...item.value.split(", ")]),
    ].join(", ");
    previous.needsReview ||= item.needsReview;
    return false;
  });
}

function unique(values: string[]): string | undefined {
  const distinct = [...new Set(values)];
  return distinct.length === 1 ? distinct[0] : undefined;
}
