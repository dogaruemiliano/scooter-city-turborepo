import { v1 } from "@repo/api-shared";
import { describe, expect, it } from "vitest";

import { createEmptyCreateForm, switchDocumentWorkflow } from "./form-state";
import {
  equivalentPersonNames,
  licenseNameDifferences,
} from "./license-name-comparison";
import {
  applyExtractionSuggestion,
  createExtractionState,
  invalidateDocumentExtraction,
  markExtractionFieldEdited,
  reconcileDocumentExtraction,
  type ExtractionState,
} from "./extraction-state";

function initial() {
  return createExtractionState(createEmptyCreateForm("foreign"));
}

function read(
  state: ExtractionState,
  suggestions: v1.persons.PersonDocumentExtractionSuggestion[],
  options: {
    key?: string;
    signature?: string;
    categories?: v1.persons.PersonDocumentExtraction["licenseCategories"];
    detectedType?: v1.persons.PersonDocumentType;
  } = {},
) {
  const document = state.form.documents.find(
    (item) => item.key === (options.key ?? "foreign-passport"),
  )!;
  return reconcileDocumentExtraction(state, {
    documentKey: document.key,
    sourceSignature: options.signature ?? "photo-v1",
    result: {
      documentType: document.type,
      detectedDocumentType: options.detectedType ?? document.type,
      sourceUploadIds: ["private-upload-id"],
      reviewRequired: true,
      suggestions,
      licenseCategories: options.categories ?? [],
      warnings: [],
    },
  });
}

function person(
  field: Extract<
    v1.persons.PersonDocumentExtractionSuggestion,
    { target: "person" }
  >["field"],
  value: string,
  needsReview = false,
): v1.persons.PersonDocumentExtractionSuggestion {
  return { target: "person", field, value, sourceSlot: "front", needsReview };
}

const category = (
  value: v1.persons.PersonDriverLicenseCategory,
): v1.persons.PersonDriverLicenseCategoryEntry => ({
  category: value,
  issuedOn: "2020-01-01",
  expiresOn: "2030-01-01",
  restrictions: null,
});

describe("person document extraction reconciliation", () => {
  it.each(["EMILIANO CONSTANTIN", "EMILIAN CONSTANTIN"])(
    "keeps the ID name when the licence reads %s, regardless of arrival order",
    (licenseName) => {
      for (const licenceFirst of [false, true]) {
        let state = initial();
        const licenseKey = state.form.documents.find(
          (document) => document.type === "driverLicense",
        )!.key;
        const identity = (current: ExtractionState) =>
          read(current, [
            person("firstName", "EMILIANO-CONSTANTIN"),
            person("lastName", "DOGARU"),
          ]);
        const license = (current: ExtractionState) =>
          read(
            current,
            [person("firstName", licenseName), person("lastName", "DOGARU")],
            { key: licenseKey },
          );
        state = licenceFirst
          ? identity(license(state))
          : license(identity(state));
        expect(state.form.firstName).toBe("EMILIANO-CONSTANTIN");
        expect(state.form.lastName).toBe("DOGARU");
        expect(state.fields["person.firstName"]!.suggestions).toHaveLength(1);
        expect(licenseNameDifferences(state)).toMatchObject([
          {
            field: "firstName",
            identityName: "EMILIANO-CONSTANTIN",
            licenseName,
            formattingOnly: licenseName === "EMILIANO CONSTANTIN",
          },
        ]);
        state = invalidateDocumentExtraction(state, licenseKey);
        expect(state.form.firstName).toBe("EMILIANO-CONSTANTIN");
        expect(licenseNameDifferences(state)).toEqual([]);
      }
    },
  );

  it.each([
    ["Ana-Maria", " ANA   MARIA ", true],
    ["Ana‑Maria", "ana maria", true],
    ["Ana Maria", "Anamaria", false],
    ["Ștefan", "Stefan", false],
    ["Ana Maria", "Maria Ana", false],
  ])(
    "compares %s and %s without hiding substantive changes",
    (left, right, equivalent) => {
      expect(equivalentPersonNames(left, right)).toBe(equivalent);
    },
  );

  it("fills empty fields, converts dates and records source and uncertainty", () => {
    const state = read(initial(), [
      person("firstName", "Ștefan", true),
      person("dateOfBirth", "1990-04-12"),
    ]);
    expect(state.form.firstName).toBe("Ștefan");
    expect(state.form.dateOfBirth).toEqual({
      year: "1990",
      month: "04",
      day: "12",
    });
    expect(state.fields["person.firstName"]?.provenance).toEqual([
      expect.objectContaining({
        documentType: "passport",
        sourceSlot: "front",
        needsReview: true,
      }),
    ]);
  });

  it("fills Romanian county codes and locality independently without overwriting manual locality edits", () => {
    let state = read(initial(), [
      person("countryCode", "RO"),
      person("region", "VL"),
      person("city", "Râmnicu Vâlcea"),
    ]);
    expect(state.form.region).toBe("Vâlcea");
    expect(state.form.city).toBe("Râmnicu Vâlcea");
    state.form.city = "Drăgășani";
    state = markExtractionFieldEdited(state, "person.city");
    state = read(
      state,
      [person("region", "VL"), person("city", "Râmnicu Vâlcea")],
      { signature: "photo-v2" },
    );
    expect(state.form.city).toBe("Drăgășani");
    expect(state.fields["person.city"]?.suggestions[0]?.value).toBe(
      "Râmnicu Vâlcea",
    );
  });

  it("matches locality after the county and does not autofill unlisted villages", () => {
    let state = read(initial(), [
      person("city", "RAMNICU VALCEA"),
      person("region", "VL"),
      person("countryCode", "RO"),
    ]);
    expect(state.form.city).toBe("Râmnicu Vâlcea");
    state = read(
      state,
      [person("city", "Unlisted village"), person("region", "VL")],
      { signature: "new-photo" },
    );
    expect(state.form.city).toBe("");
    const suggestion = state.fields["person.city"]!.suggestions[0]!;
    expect(suggestion.needsReview).toBe(true);
    expect(
      applyExtractionSuggestion(state, "person.city", suggestion.id).form.city,
    ).toBe("");
  });

  it("preserves both manually typed values and intentional clears", () => {
    let state = initial();
    state.form.firstName = "Operator's value";
    state = markExtractionFieldEdited(state, "person.firstName");
    state = markExtractionFieldEdited(state, "person.lastName");
    state = read(state, [
      person("firstName", "Extracted"),
      person("lastName", "Popescu"),
    ]);
    expect(state.form.firstName).toBe("Operator's value");
    expect(state.form.lastName).toBe("");
    expect(state.fields["person.lastName"]?.suggestions[0]?.value).toBe(
      "Popescu",
    );
  });

  it("preserves pre-existing nonempty values even without a touched marker", () => {
    const state = initial();
    state.form.firstName = "Existing";
    expect(read(state, [person("firstName", "Extracted")]).form.firstName).toBe(
      "Existing",
    );
  });

  it("clears old untouched autofill immediately when its image is removed", () => {
    const filled = read(initial(), [person("firstName", "Old photo")]);
    const invalidated = invalidateDocumentExtraction(
      filled,
      "foreign-passport",
    );
    expect(invalidated.form.firstName).toBe("");
    expect(invalidated.fields["person.firstName"]).toMatchObject({
      outdated: true,
      suggestions: [],
    });
    const replacement = read(invalidated, [person("firstName", "New photo")], {
      signature: "photo-v2",
    });
    expect(replacement.form.firstName).toBe("New photo");
    expect(replacement.fields["person.firstName"]?.outdated).toBe(false);
  });

  it("preserves operator edits when their old photo is replaced", () => {
    let state = read(initial(), [person("firstName", "Old photo")]);
    state = { ...state, form: { ...state.form, firstName: "Corrected" } };
    state = markExtractionFieldEdited(state, "person.firstName");
    state = invalidateDocumentExtraction(state, "foreign-passport");
    state = read(state, [person("firstName", "New photo")], {
      signature: "photo-v2",
    });
    expect(state.form.firstName).toBe("Corrected");
  });

  it("never chooses the first competing reading from one document", () => {
    const state = read(initial(), [
      person("firstName", "Ana"),
      person("firstName", "Anca"),
    ]);
    expect(state.form.firstName).toBe("");
    expect(state.fields["person.firstName"]?.suggestions).toHaveLength(2);
    expect(
      state.fields["person.firstName"]?.suggestions.every(
        (item) => item.needsReview,
      ),
    ).toBe(true);
  });

  it("handles cross-document conflicts independently of response order", () => {
    const passportFirst = read(
      read(initial(), [person("firstName", "Ana")]),
      [person("firstName", "Anca")],
      { key: "foreign-visa" },
    );
    const visaFirst = read(
      read(initial(), [person("firstName", "Anca")], { key: "foreign-visa" }),
      [person("firstName", "Ana")],
    );
    expect(passportFirst.form.firstName).toBe("");
    expect(visaFirst.form.firstName).toBe("");
    const consistent = invalidateDocumentExtraction(
      passportFirst,
      "foreign-visa",
    );
    expect(consistent.form.firstName).toBe("Ana");
  });

  it("combines agreeing sources and keeps review flags", () => {
    const state = read(
      read(initial(), [person("firstName", "Ana")]),
      [person("firstName", "Ana", true)],
      { key: "foreign-visa" },
    );
    expect(state.form.firstName).toBe("Ana");
    expect(state.fields["person.firstName"]?.suggestions).toHaveLength(1);
    expect(state.fields["person.firstName"]?.suggestions[0]).toMatchObject({
      needsReview: true,
      sources: expect.any(Array),
    });
    expect(state.fields["person.firstName"]?.provenance).toHaveLength(2);
  });

  it("applies an explicit choice and protects it from subsequent extraction", () => {
    let state = read(initial(), [
      person("firstName", "Ana"),
      person("firstName", "Anca"),
    ]);
    state = applyExtractionSuggestion(
      state,
      "person.firstName",
      state.fields["person.firstName"]!.suggestions[1]!.id,
    );
    expect(state.form.firstName).toBe("Anca");
    state = read(state, [person("firstName", "Ana")], {
      signature: "new-photo",
    });
    expect(state.form.firstName).toBe("Anca");
    expect(state.touched["person.firstName"]).toBe(true);
  });

  it("replaces default countries and normalizes Romanian county spelling", () => {
    let state = read(initial(), [
      person("countryCode", "DE"),
      person("region", "Berlin"),
    ]);
    expect(state.form.countryCode).toBe("DE");
    expect(state.form.region).toBe("Berlin");
    state = read(
      state,
      [person("region", "Jud. Timis"), person("countryCode", "RO")],
      { signature: "replacement" },
    );
    expect(state.form.countryCode).toBe("RO");
    expect(state.form.region).toBe("Timiș");
    state = read(state, [person("region", "Unknown county")], {
      signature: "unreadable-county",
    });
    expect(state.form.region).toBe("");
    expect(state.fields["person.region"]?.suggestions[0]?.value).toBe(
      "Unknown county",
    );
  });

  it("clears an incompatible region when explicitly applying a different country", () => {
    let state = read(initial(), [
      person("countryCode", "DE"),
      person("region", "Berlin"),
    ]);
    state = markExtractionFieldEdited(state, "person.countryCode");
    state = read(state, [person("countryCode", "RO")], { key: "foreign-visa" });
    const romanianCountry = state.fields[
      "person.countryCode"
    ]!.suggestions.find((item) => item.value === "RO")!;
    state = applyExtractionSuggestion(
      state,
      "person.countryCode",
      romanianCountry.id,
    );
    expect(state.form.countryCode).toBe("RO");
    expect(state.form.region).toBe("");
    expect(state.touched["person.region"]).toBe(true);
    state = read(state, [person("region", "Berlin")]);
    expect(state.form.region).toBe("");
  });

  it("does not change verification status when filling licence categories", () => {
    const state = read(initial(), [], {
      key: "driver-license",
      categories: [
        { value: category("AM"), sourceSlot: "back", needsReview: true },
      ],
    });
    const license = state.form.documents.find(
      (document) => document.type === "driverLicense",
    )!;
    expect(license.licenseCategories).toEqual([category("AM")]);
    expect(license.status).toBe("unverified");
  });

  it("explicitly merges licence rows while preserving unrelated manual categories", () => {
    let state = initial();
    state.form.documents.find(
      (document) => document.type === "driverLicense",
    )!.licenseCategories = [category("B")];
    state = markExtractionFieldEdited(
      state,
      "document.driver-license.licenseCategories",
    );
    state = read(state, [], {
      key: "driver-license",
      categories: [
        { value: category("AM"), sourceSlot: "back", needsReview: true },
      ],
    });
    expect(
      state.form.documents.find(
        (document) => document.type === "driverLicense",
      )!.licenseCategories,
    ).toEqual([category("B")]);
    state = applyExtractionSuggestion(
      state,
      "document.driver-license.licenseCategories",
      state.fields["document.driver-license.licenseCategories"]!.suggestions[0]!
        .id,
    );
    expect(
      state.form.documents.find(
        (document) => document.type === "driverLicense",
      )!.licenseCategories,
    ).toEqual([category("B"), category("AM")]);
  });

  it("keeps explicitly disabled expiry dates disabled", () => {
    let state = initial();
    state.form.documents[0]!.hasExpiryDate = false;
    state = markExtractionFieldEdited(
      state,
      "document.foreign-passport.hasExpiryDate",
    );
    state = read(state, [
      {
        target: "document",
        field: "expiresOn",
        value: "2030-01-01",
        sourceSlot: "front",
        needsReview: false,
      },
    ]);
    expect(state.form.documents[0]!.hasExpiryDate).toBe(false);
    expect(state.form.documents[0]!.expiresOn).toEqual({
      year: "",
      month: "",
      day: "",
    });
  });

  it("preserves an expiry checkbox edit made after autofill when its photo is removed", () => {
    let state = read(initial(), [
      {
        target: "document",
        field: "expiresOn",
        value: "2030-01-01",
        sourceSlot: "front",
        needsReview: false,
      },
    ]);
    state = {
      ...state,
      form: {
        ...state.form,
        documents: state.form.documents.map((document) =>
          document.key === "foreign-passport"
            ? { ...document, hasExpiryDate: false }
            : document,
        ),
      },
    };
    state = markExtractionFieldEdited(
      state,
      "document.foreign-passport.hasExpiryDate",
    );
    state = invalidateDocumentExtraction(state, "foreign-passport");
    expect(state.form.documents[0]!.hasExpiryDate).toBe(false);
  });

  it("ignores mismatched documents and documents outside the active workflow", () => {
    const state = read(initial(), [person("firstName", "Wrong document")], {
      detectedType: "nationalId",
    });
    expect(state.form.firstName).toBe("");
    const switched = {
      ...state,
      form: switchDocumentWorkflow(state.form, "romanian"),
    };
    const ignored = reconcileDocumentExtraction(switched, {
      documentKey: "foreign-passport",
      sourceSignature: "old-workflow",
      result: {
        documentType: "passport",
        detectedDocumentType: "passport",
        suggestions: [person("firstName", "Old workflow")],
        sourceUploadIds: ["source"],
        reviewRequired: true,
        licenseCategories: [],
        warnings: [],
      },
    });
    expect(ignored).toBe(switched);
  });
});
