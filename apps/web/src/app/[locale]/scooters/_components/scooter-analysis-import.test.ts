import { v1 } from "@repo/api-shared";
import { describe, expect, it } from "vitest";
import { prepareScooterAnalysisImport } from "./scooter-analysis-import";
import {
  scooterEditorDefaults,
  insuranceEditorDefaults,
} from "./scooter-editor-schema";
import type { DocumentSource } from "./scooter-document-sources";

const vin = "LXYTCKP05P0000001";
const civ: DocumentSource = {
  sourceId: "civ",
  type: "civ",
  fileName: "civ.pdf",
};
const registration: DocumentSource = {
  sourceId: "registration",
  type: "registration_certificate",
  fileName: "registration.pdf",
};
const insurance: DocumentSource = {
  sourceId: "insurance",
  type: "insurance",
  fileName: "insurance.pdf",
  insurancePolicyId: "policy",
};
const importer: DocumentSource = {
  sourceId: "import",
  type: "import_document",
  fileName: "import.pdf",
};
function analysis(
  source: DocumentSource,
  fields: Record<string, string | number | null>,
  documentVin: string | null = vin,
): v1.scooters.ScooterDocumentAnalysis {
  return {
    sourceId: source.sourceId,
    documentType: source.type,
    extractedData: { vin: documentVin, fields, rawFields: {} },
    issues: [],
    reviewRequired: true,
  };
}
describe("analysis suggestions through the shared import pipeline", () => {
  it("retains usable values while flagging invalid numbers and current-state incompatibilities", () => {
    const result = prepareScooterAnalysisImport(
      [
        analysis(civ, {
          powertrainType: "combustion",
          powerKw: "bad",
          electricMotorPowerKw: 5,
          color: "White",
        }),
      ],
      [civ],
      [],
      scooterEditorDefaults(),
      false,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toMatchObject({
      color: "White",
      powertrainType: "combustion",
    });
    expect(result.values.powerKw).toBeUndefined();
    expect(result.values.electricMotorPowerKw).toBeUndefined();
    expect(result.unresolved).toContain("powerKw");
  });

  it("keeps CIV authority even if its request failed without persisting fake successful evidence", () => {
    const result = prepareScooterAnalysisImport(
      [
        analysis(importer, { color: "Blue" }),
        analysis(registration, { registrationCertificateNumber: "CERT-42" }),
      ],
      [importer, civ, registration],
      [],
      scooterEditorDefaults(),
      false,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.color).toBeUndefined();
    expect(result.values.registrationCertificateNumber).toBe("CERT-42");
    expect(result.extractedDocuments).not.toHaveProperty(civ.sourceId);
    expect(result.needsVinReview).toBe(true);
  });

  it("uses CIV evidence without reviewing a superseded import document", () => {
    const result = prepareScooterAnalysisImport(
      [
        analysis(civ, { color: "White" }),
        analysis(importer, {}, "LXYTCKP05P0000002"),
      ],
      [civ, importer],
      [],
      scooterEditorDefaults(),
      false,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.color).toBe("White");
    expect(result.needsVinReview).not.toBe(true);
  });

  it("does not ask for VIN confirmation of an import skipped by AI", () => {
    const result = prepareScooterAnalysisImport(
      [analysis(civ, { color: "White" })],
      [importer, civ],
      [],
      scooterEditorDefaults(),
      false,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.needsVinReview).not.toBe(true);
    expect(result.extractedDocuments).not.toHaveProperty(importer.sourceId);
  });

  it("preserves confirmed empty dashes and zero values, and leaves unknown VINs unconfirmed", () => {
    const result = prepareScooterAnalysisImport(
      [
        analysis(
          civ,
          { actualWeightKg: "-", standingCapacity: 0, vehicleClass: null },
          null,
        ),
      ],
      [civ],
      [],
      scooterEditorDefaults(),
      false,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.standingCapacity).toBe("0");
    expect(result.confirmedEmpty).toContain("actualWeightKg");
    expect(result.unresolved).toContain("vehicleClass");
    expect(result.needsVinReview).toBe(true);
  });

  it("warns about insurance issues without changing original raw readings", () => {
    const input = analysis(insurance, {
      insuredName: "Example Person",
      premiumAmount: 200,
      currency: "RON",
    });
    input.extractedData.rawFields = { premiumAmount: "200,00 Lei" };
    input.issues = [{ field: "premiumAmount", code: "conflictingValues" }];
    const values = {
      ...scooterEditorDefaults(),
      insurancePolicies: [{ ...insuranceEditorDefaults(), id: "policy" }],
    };
    const result = prepareScooterAnalysisImport(
      [input],
      [insurance],
      [],
      values,
      false,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.insurancePolicies?.[0]?.rawFields?.premiumAmount).toBe(
      "200,00 Lei",
    );
    expect(result.unresolvedInsuranceFields).toEqual({
      policy: ["premiumAmount"],
    });
  });
});
