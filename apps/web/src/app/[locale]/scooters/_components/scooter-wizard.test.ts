import { describe, expect, it } from "vitest";
import type { v1 } from "@repo/api-shared";
import { CREATE_FIELDS } from "./scooter-editor-schema";
import {
  scooterWizardSteps,
  stepFields,
  type ScooterWizardStep,
} from "./scooter-wizard";

type DocumentType = v1.scooters.ScooterDocumentType;
const combinations: [DocumentType[], ScooterWizardStep[]][] = [
  [[], []],
  [["import_document"], ["import_document"]],
  [["civ"], ["civ"]],
  [["registration_certificate"], ["registration_certificate"]],
  [["insurance"], ["insurance"]],
  [["import_document", "civ"], ["civ"]],
  [
    ["import_document", "registration_certificate"],
    ["import_document", "registration_certificate"],
  ],
  [
    ["import_document", "insurance"],
    ["import_document", "insurance"],
  ],
  [
    ["civ", "registration_certificate"],
    ["civ", "registration_certificate"],
  ],
  [
    ["civ", "insurance"],
    ["civ", "insurance"],
  ],
  [
    ["registration_certificate", "insurance"],
    ["registration_certificate", "insurance"],
  ],
  [
    ["import_document", "civ", "registration_certificate"],
    ["civ", "registration_certificate"],
  ],
  [
    ["import_document", "civ", "insurance"],
    ["civ", "insurance"],
  ],
  [
    ["import_document", "registration_certificate", "insurance"],
    ["import_document", "registration_certificate", "insurance"],
  ],
  [
    ["civ", "registration_certificate", "insurance"],
    ["civ", "registration_certificate", "insurance"],
  ],
  [
    ["import_document", "civ", "registration_certificate", "insurance"],
    ["civ", "registration_certificate", "insurance"],
  ],
];

describe("scooter creation review steps", () => {
  it.each(combinations)(
    "reviews only applicable uploaded documents: %j",
    (uploaded, reviews) => {
      // Input order is not guaranteed: files may be selected in any order.
      expect(scooterWizardSteps([...uploaded].reverse())).toEqual([
        "documents",
        ...reviews,
        "operational",
      ]);
    },
  );

  it("groups multiple files into one review and switches authority when CIV is removed", () => {
    const uploaded: DocumentType[] = [
      "civ",
      "import_document",
      "insurance",
      "import_document",
    ];
    expect(scooterWizardSteps(uploaded)).toEqual([
      "documents",
      "civ",
      "insurance",
      "operational",
    ]);
    expect(
      scooterWizardSteps(uploaded.filter((type) => type !== "civ")),
    ).toEqual(["documents", "import_document", "insurance", "operational"]);
  });

  it("does not require future registration, insurance or operational fields during technical review", () => {
    expect(stepFields("documents")).toEqual([]);
    for (const step of ["civ", "import_document"] as const) {
      const fields = stepFields(step);
      expect(fields).toEqual(
        expect.arrayContaining([
          "vin",
          "brandId",
          "powertrainType",
          "maxSpeedKmh",
        ]),
      );
      for (const deferred of [
        "registrationType",
        "requiredLicenseCategory",
        "insurancePolicies",
        "hasGps",
        "currentMileageKm",
        "actualMaxSpeedKmh",
        "notes",
      ])
        expect(fields).not.toContain(deferred);
    }
    expect(stepFields("import_document")).not.toContain("civVersion");
    expect(stepFields("import_document")).not.toContain("civNumber");
    expect(stepFields("civ")).toContain("civVersion");
    expect(stepFields("insurance")).toEqual([
      "itpValidUntil",
      "insurancePolicies",
    ]);
    expect(stepFields("registration_certificate")).toContain(
      "requiredLicenseCategory",
    );
    expect(stepFields("operational")).toContain("actualMaxSpeedKmh");
    expect(stepFields("operational")).not.toContain("maxSpeedKmh");
  });

  it("routes each scalar field to exactly one review stage when all review types exist", () => {
    const fields = [
      "civ",
      "registration_certificate",
      "insurance",
      "operational",
    ].flatMap((step) => stepFields(step as ScooterWizardStep));
    expect(new Set(fields).size).toBe(fields.length);
    expect(
      fields.filter((field) => field !== "insurancePolicies").sort(),
    ).toEqual([...CREATE_FIELDS].sort());
  });
});
