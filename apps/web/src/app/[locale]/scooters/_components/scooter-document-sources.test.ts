import { describe, expect, it } from "vitest";
import {
  parseDocumentImport,
  documentExtractionPrompt,
} from "./scooter-document-import";
import {
  scooterEditorDefaults,
  insuranceEditorDefaults,
} from "./scooter-editor-schema";
import type { DocumentSource } from "./scooter-document-sources";

const vin = "LXYTCKP05P0000001";
const sources: DocumentSource[] = [
  { sourceId: "import-1", type: "import_document", fileName: "foreign.pdf" },
  { sourceId: "civ-1", type: "civ", fileName: "civ.pdf" },
  {
    sourceId: "registration-1",
    type: "registration_certificate",
    fileName: "registration.pdf",
  },
  {
    sourceId: "insurance-1",
    type: "insurance",
    fileName: "insurance.pdf",
    insurancePolicyId: "policy-1",
  },
];
const current = {
  ...scooterEditorDefaults(),
  powertrainType: "combustion",
  insurancePolicies: [{ ...insuranceEditorDefaults(), id: "policy-1" }],
};
function document(
  source: DocumentSource,
  fields: Record<string, string | number | null> = {},
  rawFields: Record<string, string | null> = {},
  documentVin: string | null = vin,
) {
  return {
    sourceId: source.sourceId,
    documentType: source.type,
    vin: documentVin,
    fields,
    rawFields,
  };
}
function parse(documents: unknown[], manifest = sources, values = current) {
  return parseDocumentImport(
    JSON.stringify({ schemaVersion: 2, documents }),
    [{ id: "brand-1", name: "KYMCO" }],
    values,
    false,
    {},
    [],
    manifest,
  );
}

describe("source-aware extraction", () => {
  it("uses CIV exclusively for technical data, certificate for registration, and links insurance by its source", () => {
    const result = parse([
      document(
        sources[0]!,
        { powerKw: 5, color: "Blue", engineCode: "foreign" },
        { Power: "5" },
      ),
      document(
        sources[1]!,
        {
          brandName: "KYMCO",
          maxSpeedKmh: 25,
          powerKw: 2.68,
          engineCode: null,
        },
        { "P.2": "2,68", "13": null },
      ),
      document(sources[2]!, {
        registrationType: "local",
        registrationNumber: "14947",
      }),
      document(
        sources[3]!,
        {
          insuredName: "Example SRL",
          validFrom: "2026-01-01",
          validUntil: "2026-12-31",
          premiumAmount: "278,88",
          currency: "RON",
          documentVin: vin,
        },
        { premiumAmount: "278,88" },
      ),
    ]);
    expect(result).toMatchObject({
      ok: true,
      values: {
        vin,
        brandId: "brand-1",
        powerKw: "2.68",
        maxSpeedKmh: "25",
        requiredLicenseCategory: "none",
        registrationNumber: "14947",
      },
      unresolved: ["engineCode"],
      rawFields: { "P.2": "2,68" },
      insurancePolicies: [
        { id: "policy-1", insuredName: "Example SRL", premiumAmount: "278.88" },
      ],
      fieldSources: {
        powerKw: ["civ-1"],
        brandId: ["civ-1"],
        registrationNumber: ["registration-1"],
        "insurancePolicies.0.insuredName": ["insurance-1"],
      },
      extractedDocuments: {
        "import-1": { rawFields: { Power: "5" } },
        "civ-1": { rawFields: { "13": null } },
      },
    });
    if (!result.ok) throw new Error("Expected valid import");
    expect(result.values).not.toHaveProperty("color");
    expect(result.values).not.toHaveProperty("engineCode");
  });

  it("imports foreign technical data without manufacturing any CIV metadata or Romanian registration", () => {
    const result = parse(
      [
        document(
          sources[0]!,
          { brandName: "KYMCO", powerKw: 2.5 },
          { foreignPlate: "AB-123" },
        ),
      ],
      [sources[0]!],
    );
    expect(result).toMatchObject({
      ok: true,
      values: { vin, brandId: "brand-1", powerKw: "2.5" },
      extractedDocuments: {
        "import-1": { rawFields: { foreignPlate: "AB-123" } },
      },
    });
    if (!result.ok) throw new Error("Expected valid import");
    expect(result.rawFields).toBeUndefined();
    for (const key of ["civNumber", "civVersion", "registrationNumber"])
      expect(result.values).not.toHaveProperty(key);
    for (const field of [
      "civNumber",
      "civIssuedAt",
      "registrationNumber",
      "notes",
      "currentMileageKm",
      "actualMaxSpeedKmh",
      "hasGps",
    ]) {
      expect(
        parse([document(sources[0]!, { [field]: "bad" })], [sources[0]!]),
      ).toMatchObject({ ok: false, reason: "invalidFields" });
    }
  });

  it("requires exact manifest coverage and prevents forged, duplicate or incorrectly typed sources", () => {
    const entries = sources.map((source) => document(source));
    for (const docs of [
      entries.slice(1),
      [...entries, entries[0]],
      entries.map((entry, index) =>
        index ? entry : { ...entry, sourceId: "invented" },
      ),
      entries.map((entry, index) =>
        index ? entry : { ...entry, documentType: "civ" },
      ),
    ]) {
      expect(parse(docs)).toMatchObject({
        ok: false,
        reason: "invalidSources",
      });
    }
    expect(parse([document(sources[0]!)], [])).toMatchObject({
      ok: false,
      reason: "invalidSources",
    });
  });

  it("checks import VINs alongside CIV while retaining strict per-file assertions", () => {
    const attached = sources.slice(0, 2);
    expect(
      parse(
        [
          document(attached[0]!, {}, {}, "LXYTCKP05P0000002"),
          document(attached[1]!, { powerKw: 2 }),
        ],
        attached,
      ),
    ).toMatchObject({ ok: false, reason: "vinMismatch" });
    const result = parse(
      [
        document(attached[0]!, {}, {}, null),
        document(attached[1]!, { powerKw: 2 }),
      ],
      attached,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.needsVinReview).toBeUndefined();
    expect(
      parse(
        [document(attached[0]!, { vin: "LXYTCKP05P0000002" })],
        [attached[0]!],
      ),
    ).toMatchObject({ ok: false, reason: "invalidSources" });
  });

  it("merges complementary insurance attachments for one explicit policy and retains every source", () => {
    const first = sources[3]!;
    const second = { ...first, sourceId: "insurance-2", fileName: "back.jpg" };
    const result = parse(
      [
        document(first, { insuredName: "Example SRL", premiumAmount: 0 }),
        document(second, {
          validFrom: "2026-01-01",
          validUntil: "2026-12-31",
          currency: "RON",
        }),
      ],
      [first, second],
    );
    expect(result).toMatchObject({
      ok: true,
      insurancePolicies: [
        {
          id: "policy-1",
          insuredName: "Example SRL",
          validFrom: "2026-01-01",
          validUntil: "2026-12-31",
          premiumAmount: "0",
          currency: "RON",
          sourceFileNames: ["insurance.pdf", "back.jpg"],
        },
      ],
      fieldSources: {
        "insurancePolicies.0.insuredName": ["insurance-1", "insurance-2"],
      },
      extractedDocuments: {
        "insurance-1": { fields: { insuredName: "Example SRL" } },
        "insurance-2": { fields: { currency: "RON" } },
      },
    });
    if (!result.ok) throw new Error("Expected import");
    expect(result.insurancePolicies).toHaveLength(1);
    expect(result).not.toHaveProperty("needsVinReview");
  });

  it("keeps successful insurance values when another attachment has no extraction yet", () => {
    const first = sources[3]!;
    const second = { ...first, sourceId: "insurance-2", fileName: "back.jpg" };
    expect(
      parse(
        [
          document(first, { insuredName: "Example SRL" }),
          document(second, {}, {}, null),
        ],
        [first, second],
      ),
    ).toMatchObject({
      ok: true,
      insurancePolicies: [
        { id: "policy-1", insuredName: "Example SRL", documentVin: vin },
      ],
    });
  });

  it("blocks conflicting VINs between attachments of the same insurance policy", () => {
    const first = sources[3]!;
    const second = { ...first, sourceId: "insurance-2", fileName: "back.jpg" };
    expect(
      parse(
        [document(first), document(second, {}, {}, "LXYTCKP05P0000002")],
        [first, second],
      ),
    ).toMatchObject({ ok: false, reason: "vinMismatch" });
  });

  it("merges multiple import pages conservatively and preserves unresolved raw rubrics for document review", () => {
    const second: DocumentSource = {
      ...sources[0]!,
      sourceId: "import-2",
      fileName: "back.jpg",
    };
    expect(
      parse(
        [
          document(
            sources[0]!,
            { powerKw: 2, seatsCount: 0, maxTrainMassKg: "-" },
            { unreadable: null },
          ),
          document(second, { powerKw: 3, color: "Red" }),
        ],
        [sources[0]!, second],
      ),
    ).toMatchObject({
      ok: true,
      values: { seatsCount: "0", color: "Red" },
      unresolved: ["powerKw"],
      confirmedEmpty: ["maxTrainMassKg"],
      fieldSources: { powerKw: ["import-1", "import-2"] },
      unresolvedDocumentFields: { "import-1": ["unreadable"] },
    });
  });

  it("accepts a legacy response only with an unambiguous single attached source and discards retired CIV mentions", () => {
    const input = JSON.stringify({
      vin,
      powerKw: 2,
      civMentions: "retired",
      civRawFields: { "P.2": "2", Mențiuni: "retired" },
    });
    const imported = parseDocumentImport(
      input,
      [],
      current,
      false,
      {},
      [],
      [sources[1]!],
    );
    expect(imported).toMatchObject({
      ok: true,
      values: { vin, powerKw: "2" },
      rawFields: { "P.2": "2" },
      extractedDocuments: {
        "civ-1": { fields: { powerKw: 2 }, rawFields: { "P.2": "2" } },
      },
    });
    if (!imported.ok) throw new Error("Expected valid import");
    expect(imported.extractedDocuments?.["civ-1"]?.fields).not.toHaveProperty(
      "civMentions",
    );
    expect(
      parseDocumentImport(
        input,
        [],
        current,
        false,
        {},
        [],
        sources.slice(0, 2),
      ),
    ).toMatchObject({ ok: false, reason: "invalidSources" });
  });

  it("rejects insurance without any attached policy document when creating", () => {
    expect(
      parseDocumentImport(
        JSON.stringify({ insurancePolicies: [{ insuredName: "Example" }] }),
        [],
        current,
        false,
      ),
    ).toMatchObject({ ok: false, reason: "invalidSources" });
  });

  it("provides a parseable v2 template with the exact uploaded sources and no extra properties", () => {
    const prompt = documentExtractionPrompt(false, (field) => field, sources);
    const templateText = prompt
      .split("Șablon pentru CONȚINUTUL fișierului scuter.json:\n")[1]
      ?.split("\n\nChei fields")[0];
    expect(templateText).toBeDefined();
    const template = JSON.parse(templateText!) as {
      schemaVersion: number;
      documents: ReturnType<typeof document>[];
    };
    expect(Object.keys(template).sort()).toEqual([
      "documents",
      "schemaVersion",
    ]);
    expect(template.schemaVersion).toBe(2);
    expect(template.documents).toHaveLength(sources.length);
    for (const [index, entry] of template.documents.entries()) {
      expect(Object.keys(entry).sort()).toEqual([
        "documentType",
        "fields",
        "rawFields",
        "sourceId",
        "vin",
      ]);
      expect(entry).toMatchObject({
        sourceId: sources[index]!.sourceId,
        documentType: sources[index]!.type,
        vin: null,
        rawFields: {},
      });
      expect(prompt).toContain(JSON.stringify(sources[index]!.fileName));
    }
    expect(parse(template.documents)).toMatchObject({
      ok: true,
      needsVinReview: true,
    });
  });

  it("keeps document evidence separate without operational extraction fields or obsolete envelopes", () => {
    const prompt = documentExtractionPrompt(false, (field) => field, sources);
    expect(prompt).toContain("VIN-ul pe celelalte documente separat");
    expect(prompt).toContain("nu copia VIN-ul între documente");
    expect(prompt).toContain("VIN necitibil = null");
    expect(prompt).toContain(
      "CIV are prioritate tehnică; nu completa golurile lui din alte documente",
    );
    for (const field of [
      "civMentions",
      "hasGps",
      "odometerWorking",
      "speedometerWorking",
      "actualMaxSpeedKmh",
      "currentMileageKm",
      "notes",
      "civRawFields",
      "documentVins",
      "insurancePolicies",
    ])
      expect(prompt).not.toContain(field);
  });

  it("limits field dictionaries to the attached document types and keeps a typical prompt compact", () => {
    const importPrompt = documentExtractionPrompt(false, (field) => field, [
      sources[0]!,
    ]);
    expect(importPrompt).toContain("\npowerKw: ");
    expect(importPrompt).not.toContain("CIV 2024/2016/1993=");
    expect(importPrompt).not.toContain("civNumber");
    expect(importPrompt).not.toContain("registrationNumber");
    expect(importPrompt).not.toContain("insuredName");

    const certificatePrompt = documentExtractionPrompt(
      false,
      (field) => field,
      [sources[2]!],
    );
    expect(certificatePrompt).toContain("\nregistrationNumber: ");
    expect(certificatePrompt).not.toContain("powerKw");
    expect(certificatePrompt).not.toContain("insuredName");

    const typicalPrompt = documentExtractionPrompt(
      false,
      (field) => field,
      sources.slice(1),
    );
    expect(typicalPrompt.length).toBeLessThan(16_000);
  });
});
