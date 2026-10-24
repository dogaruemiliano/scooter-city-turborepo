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
    expect(result.needsVinReview).toBeUndefined();
  });

  it("selects the CIV VIN and preserves conflicting source readings for review", () => {
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
    expect(result).toMatchObject({ ok: true, values: { vin } });
    if (result.ok)
      expect(result.extractedDocuments?.[importer.sourceId].vin).toBe(
        "LXYTCKP05P0000002",
      );
  });

  it("does not request another VIN when the CIV already supplies it", () => {
    const result = prepareScooterAnalysisImport(
      [analysis(civ, { color: "White" })],
      [importer, civ],
      [],
      scooterEditorDefaults(),
      false,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.needsVinReview).toBeUndefined();
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

it("imports CIV and insurance children from one PDF while retaining one physical source", () => {
  const source = { ...civ, insurancePolicyId: "policy-one" };
  const mixed = analysis(source, { color: "White" });
  mixed.extractedData.documents = [
    {
      id: "civ",
      documentType: "civ",
      pages: [1],
      vin,
      fields: { color: "White", civIssuedAt: "2026-10-01" },
      rawFields: { "Data eliberării": "01.10.2026" },
    },
    {
      id: "insurance",
      documentType: "insurance",
      pages: [2],
      vin,
      fields: {
        insuredName: "Example SRL",
        validFrom: "2026-01-01",
        validUntil: "2026-12-31",
        premiumAmount: 200,
        currency: "RON",
        documentVin: vin,
      },
      rawFields: {},
    },
    {
      id: "foreign",
      documentType: "foreign_registration",
      pages: [3, 4],
      vin,
      fields: { foreignRegistrationNumber: "AB-123-C" },
      rawFields: { kenteken: "AB-123-C" },
    },
  ];
  const result = prepareScooterAnalysisImport(
    [mixed],
    [source],
    [],
    scooterEditorDefaults(),
    false,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.values).toMatchObject({
    color: "White",
    civIssuedAt: "2026-10-01",
  });
  expect(result.insurancePolicies?.[0]).toMatchObject({
    id: "policy-one",
    insuredName: "Example SRL",
    premiumAmount: "200",
  });
  expect(Object.keys(result.extractedDocuments ?? {})).toEqual([
    source.sourceId,
  ]);
  expect(result.extractedDocuments?.[source.sourceId]?.documents).toHaveLength(
    3,
  );
  expect(
    result.extractedDocuments?.[source.sourceId]?.documents?.[2]?.fields
      .foreignRegistrationNumber,
  ).toBe("AB-123-C");
});

it("fills the priority VIN while retaining mismatched logical readings within one PDF", () => {
  const mixed = analysis(civ, {});
  mixed.extractedData.documents = [
    {
      id: "civ",
      documentType: "civ",
      pages: [1],
      vin,
      fields: {},
      rawFields: {},
    },
    {
      id: "foreign",
      documentType: "foreign_registration",
      pages: [2],
      vin: "LXYTCKP05P0000002",
      fields: {},
      rawFields: {},
    },
  ];
  expect(
    prepareScooterAnalysisImport(
      [mixed],
      [civ],
      [],
      scooterEditorDefaults(),
      false,
    ),
  ).toMatchObject({
    ok: true,
    values: { vin },
    extractedDocuments: { civ: { documents: mixed.extractedData.documents } },
  });
});

it("imports the selected current policy and preserves historical insurance readings in the same PDF", () => {
  const source = { ...civ, insurancePolicyId: "current-policy" };
  const mixed = analysis(source, {});
  mixed.extractedData.documents = [
    {
      id: "old",
      documentType: "insurance",
      pages: [1],
      vin,
      fields: { insuredName: "Old holder", premiumAmount: 100 },
      rawFields: { policyNumber: "OLD" },
    },
    {
      id: "current",
      documentType: "insurance",
      pages: [2],
      vin,
      fields: { insuredName: "Current holder", premiumAmount: 200 },
      rawFields: { policyNumber: "CURRENT" },
    },
  ];
  const result = prepareScooterAnalysisImport(
    [mixed],
    [source],
    [],
    scooterEditorDefaults(),
    false,
    { currentInsuranceSourceId: `${source.sourceId}:current` },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.insurancePolicies).toHaveLength(1);
  expect(result.insurancePolicies?.[0]).toMatchObject({
    insuredName: "Current holder",
    premiumAmount: "200",
  });
  expect(result.extractedDocuments?.[source.sourceId]).toMatchObject({
    currentInsuranceDocumentId: "current",
    documents: [
      { id: "old", rawFields: { policyNumber: "OLD" } },
      { id: "current" },
    ],
  });
  const history = prepareScooterAnalysisImport(
    [mixed],
    [source],
    [],
    scooterEditorDefaults(),
    false,
    { currentInsuranceSourceId: null },
  );
  expect(history.ok).toBe(true);
  if (history.ok) {
    expect(history.insurancePolicies).toBeUndefined();
    expect(
      history.extractedDocuments?.[source.sourceId]?.currentInsuranceDocumentId,
    ).toBeNull();
    expect(
      history.extractedDocuments?.[source.sourceId]?.documents,
    ).toHaveLength(2);
  }
});

it("does not reapply CIV-only values after a document type is corrected to ownership proof", () => {
  const mixed = analysis(civ, {});
  mixed.extractedData.documents = [
    {
      id: "corrected",
      documentType: "ownership_proof",
      pages: [1],
      vin,
      fields: {
        model: "Printed model",
        civNumber: "C123",
        civIssuedAt: "2026-10-01",
      },
      rawFields: {},
      issues: [{ field: "civIssuedAt", code: "unreadable" }],
    },
  ];
  const result = prepareScooterAnalysisImport(
    [mixed],
    [civ],
    [],
    scooterEditorDefaults(),
    false,
  );
  expect(result).toMatchObject({
    ok: true,
    values: { model: "Printed model" },
  });
  if (result.ok) {
    expect(result.values).not.toHaveProperty("civNumber");
    expect(result.unresolved).not.toContain("civIssuedAt");
  }
});
