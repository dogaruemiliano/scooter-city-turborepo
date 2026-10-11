import { describe, expect, it } from "vitest";
import {
  activeImportReviews,
  importFieldReviews,
  unresolvedDocumentRubrics,
} from "./scooter-import-review";
import { parseDocumentImport } from "./scooter-document-import";
import {
  insuranceEditorDefaults,
  scooterEditorDefaults,
} from "./scooter-editor-schema";

const current = {
  ...scooterEditorDefaults(),
  civVersion: "2024",
  powertrainType: "combustion",
  powerKw: "2.68",
};
function review(source: unknown, snapshot = current) {
  const result = parseDocumentImport(
    JSON.stringify(source),
    [],
    snapshot,
    false,
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  return importFieldReviews(result, {
    ...snapshot,
    ...result.values,
    ...(result.insurancePolicies
      ? { insurancePolicies: result.insurancePolicies }
      : {}),
  });
}

describe("import field review", () => {
  it("deduplicates raw and normalized fields and excludes inapplicable controls", () => {
    const reviews = review({
      powerKw: null,
      civRawFields: { "P.2": null, "15": null, Mențiuni: "" },
    });
    expect(Object.keys(activeImportReviews(reviews, current, false))).toEqual([
      "powerKw",
    ]);
    expect(
      activeImportReviews(reviews, current, false).powerKw?.rawCodes,
    ).toEqual(["P.2"]);
    expect(
      Object.keys(
        activeImportReviews(reviews, { ...current, powerKw: "3" }, false),
      ),
    ).toEqual([]);
  });
  it("distinguishes printed dashes, existing-value conflicts and genuine zero", () => {
    const reviews = review({
      powerKw: "-",
      standingCapacity: 0,
      actualWeightKg: "-",
    });
    expect(Object.keys(activeImportReviews(reviews, current, false))).toEqual([
      "powerKw",
    ]);
  });
  it("flags unmatched brands and unresolved CIV versions without guessing a rubric mapping", () => {
    const snapshot = { ...current, civVersion: "unknown" };
    const reviews = review(
      {
        brandName: "Missing brand",
        civVersion: "unknown",
        civRawFields: { "15": null },
      },
      snapshot,
    );
    expect(Object.keys(activeImportReviews(reviews, snapshot, false))).toEqual([
      "brandId",
      "civVersion",
    ]);
    expect(
      reviews.some((entry) => entry.field === "electricMotorPowerKw"),
    ).toBe(false);
  });
  it("uses version-specific mappings and retains unrecognized rubrics for review", () => {
    expect(
      review(
        { civRawFields: { "15": null } },
        { ...current, civVersion: "2016" },
      )[0]?.field,
    ).toBe("powertrainType");
    const entries = review({ civRawFields: { "Custom rubric": null } });
    expect(entries).toEqual([]);
    const result = parseDocumentImport(
      JSON.stringify({ civRawFields: { "Custom rubric": null, Mențiuni: "" } }),
      [],
      current,
      false,
    );
    if (!result.ok) throw new Error("Expected accepted raw fields");
    expect(unresolvedDocumentRubrics(result, current)).toEqual([
      "Custom rubric",
    ]);
  });
  it("only counts visible registration and Other fields", () => {
    const entries = review({
      registrationDate: null,
      temporaryRegistrationExpiresAt: null,
      fuelTypeOther: null,
    });
    expect(Object.keys(activeImportReviews(entries, current, false))).toEqual(
      [],
    );
    expect(
      Object.keys(
        activeImportReviews(
          entries,
          { ...current, registrationType: "national" },
          false,
        ),
      ),
    ).toEqual(["registrationDate"]);
  });
  it("keeps insurance warnings attached to policy IDs after array removal and reordering", () => {
    const first = insuranceEditorDefaults();
    const second = insuranceEditorDefaults();
    const entries = [
      { field: "premiumAmount", value: "", policyId: second.id, rawCodes: [] },
    ];
    expect(
      Object.keys(
        activeImportReviews(
          entries,
          { ...current, insurancePolicies: [first, second] },
          true,
        ),
      ),
    ).toEqual(["insurancePolicies.1.premiumAmount"]);
    expect(
      Object.keys(
        activeImportReviews(
          entries,
          { ...current, insurancePolicies: [second] },
          true,
        ),
      ),
    ).toEqual(["insurancePolicies.0.premiumAmount"]);
    expect(
      activeImportReviews(
        entries,
        { ...current, insurancePolicies: [first] },
        true,
      ),
    ).toEqual({});
    expect(
      activeImportReviews(
        entries,
        { ...current, insurancePolicies: [{ ...second, premiumAmount: "12" }] },
        true,
      ),
    ).toEqual({});
  });
});
