import { v1 } from "@repo/api-shared";
import { describe, expect, it } from "vitest";
import { reviewScooterDocumentVin } from "./scooter-vin-review";
import { prepareScooterAnalysisImport } from "./scooter-analysis-import";
import { scooterEditorDefaults } from "./scooter-editor-schema";

const correct = "LXYTCZP05P0000001";
const misread = "LXYTC2P05P0000001";
const input: v1.scooters.ScooterDocumentAnalysis = {
  sourceId: "registration",
  documentType: "registration_certificate",
  extractedData: {
    vin: misread,
    fields: { vin: misread },
    rawFields: { E: misread },
  },
  issues: [
    { field: "vin", code: "conflictingValues" },
    { field: "registrationDate", code: "unreadable" },
  ],
  reviewRequired: true,
};

describe("explicit document VIN corrections", () => {
  it("preserves the AI reading and raw text while correcting the normalized VIN", () => {
    const result = reviewScooterDocumentVin(
      input,
      ` ${correct.toLowerCase()} `,
    )!;
    expect(result.extractedData).toEqual({
      vin: correct,
      fields: { vin: correct },
      rawFields: { E: misread },
      vinReview: { method: "manual", originalVin: misread },
    });
    expect(input.extractedData.vin).toBe(misread);
    expect(result.issues).toEqual([
      { field: "registrationDate", code: "unreadable" },
    ]);
    expect(
      reviewScooterDocumentVin(result, misread)!.extractedData.vinReview
        ?.originalVin,
    ).toBe(misread);
  });

  it("retains an originally unreadable VIN across subsequent corrections", () => {
    const unreadable = {
      ...input,
      extractedData: { ...input.extractedData, vin: null },
    };
    const first = reviewScooterDocumentVin(unreadable, correct)!;
    expect(
      reviewScooterDocumentVin(first, misread)!.extractedData.vinReview,
    ).toEqual({ method: "manual", originalVin: null });
  });

  it("rejects invalid VINs and leaves unchanged readings unmarked", () => {
    for (const vin of ["", "short", correct.replace("Z", "I"), `${correct}1`])
      expect(reviewScooterDocumentVin(input, vin)).toBeNull();
    expect(reviewScooterDocumentVin(input, misread)).toBe(input);
  });

  it("keeps conflicts blocked until explicit review and persists its provenance through import", () => {
    const sources = [
      { sourceId: "civ", type: "civ" as const, fileName: "civ.pdf" },
      {
        sourceId: "registration",
        type: "registration_certificate" as const,
        fileName: "registration.pdf",
      },
      {
        sourceId: "import",
        type: "import_document" as const,
        fileName: "import.jpg",
      },
    ];
    const civ = {
      ...input,
      sourceId: "civ",
      documentType: "civ" as const,
      extractedData: { vin: correct, fields: { vin: correct }, rawFields: {} },
      issues: [],
    };
    const parse = (registration: typeof input) =>
      prepareScooterAnalysisImport(
        [civ, registration],
        sources,
        [],
        scooterEditorDefaults(),
        false,
      );
    const rejected = parse(input);
    expect(rejected).toMatchObject({
      ok: false,
      reason: "vinMismatch",
      fields: [`civ.pdf: ${correct}`, `registration.pdf: ${misread}`],
    });
    const accepted = parse(reviewScooterDocumentVin(input, correct)!);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.values.vin).toBe(correct);
    expect(accepted.extractedDocuments?.registration).toMatchObject({
      vin: correct,
      rawFields: { E: misread },
      vinReview: { method: "manual", originalVin: misread },
    });
    expect(accepted.needsVinReview).not.toBe(true);
    expect(
      parse(reviewScooterDocumentVin(input, "LXYTCBP05P0000001")!),
    ).toMatchObject({ ok: false, reason: "vinMismatch" });
  });

  it("updates insurance VIN assertions without replacing raw insurance text", () => {
    const result = reviewScooterDocumentVin(
      {
        ...input,
        documentType: "insurance",
        extractedData: {
          vin: misread,
          fields: { documentVin: misread },
          rawFields: { documentVin: misread },
        },
      },
      correct,
    )!;
    expect(result.extractedData.fields.documentVin).toBe(correct);
    expect(result.extractedData.rawFields.documentVin).toBe(misread);
  });
});
