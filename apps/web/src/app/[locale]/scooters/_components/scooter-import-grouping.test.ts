import { describe, expect, it } from "vitest";
import { scooterEditorDefaults } from "./scooter-editor-schema";
import {
  mergeScooterImportSnapshots,
  scooterImportIdentity,
  scooterImportHasManualValues,
  type ScooterImportSnapshot,
} from "./scooter-import-workspace";

const vin = "LXYTCKP05P0000001";
function snapshot(
  id: string,
  type: "civ" | "foreign_registration" | "registration_certificate",
  reading: string | null = vin,
): ScooterImportSnapshot {
  return {
    version: 1,
    values: scooterEditorDefaults(),
    documents: {
      drafts: [
        {
          id,
          type,
          file: {
            name: `${id}.pdf`,
            type: "application/pdf",
            size: 100,
            lastModified: 1,
          },
          status: "ready",
          uploadToken: id,
        },
      ],
      extractions: {},
      removedIds: [],
    },
    analysis: {
      entries: {
        [id]: {
          status: "success",
          analysis: {
            sourceId: id,
            documentType: type,
            extractedData: { vin: reading, fields: {}, rawFields: {} },
            issues: [],
            reviewRequired: true,
          },
        },
      },
      attempts: [],
      cache: [[id, id]],
    },
    extraction: {
      origins: [],
      manual: [],
      confirmedSources: [],
      automaticBaselines: [],
      rawBySource: [],
    },
    importedRawFields: null,
    importedSignature: null,
    automaticImport: "done",
    reviewedDocuments: [],
    createdBrands: [],
    status: "review",
  };
}
describe("scooter grouping", () => {
  it("groups by reliable VIN and retains all documents and the destination edits", () => {
    const target = snapshot("civ", "civ");
    const source = snapshot("foreign", "foreign_registration");
    target.values.notes = "Manual correction";
    expect(scooterImportIdentity(target)).toBe(scooterImportIdentity(source));
    const merged = mergeScooterImportSnapshots(target, source);
    expect(merged.values.notes).toBe("Manual correction");
    expect(merged.documents.drafts).toHaveLength(2);
    expect(Object.keys(merged.analysis.entries)).toHaveLength(2);
    expect(merged.automaticImport).toBe("");
  });
  it("does not infer grouping from unreadable or handwritten VINs", () => {
    expect(
      scooterImportIdentity(snapshot("missing", "foreign_registration", null)),
    ).toBeNull();
    expect(
      scooterImportIdentity(
        snapshot("registration", "registration_certificate"),
      ),
    ).toBeNull();
  });
  it("detects edits in a secondary draft before its files can be grouped", () => {
    const source = snapshot("foreign", "foreign_registration");
    expect(scooterImportHasManualValues(source)).toBe(false);
    source.values.notes = "Do not lose this";
    expect(scooterImportHasManualValues(source)).toBe(true);
    source.values.notes = "";
    source.values.model = "Automatic";
    source.extraction.origins.push([
      "model",
      {
        field: "model",
        baseline: "",
        lastAuto: "Automatic",
        sourceIds: ["foreign"],
      },
    ]);
    expect(scooterImportHasManualValues(source)).toBe(false);
    source.values.model = "Manual";
    expect(scooterImportHasManualValues(source)).toBe(true);
  });
});
