import { v1 } from "@repo/api-shared";
import { ScooterDocumentExtractionService } from "./scooter-document-extraction.service";
import {
  extractionFieldsForType,
  scooterDocumentModelJsonSchema,
  scooterDocumentModelOutputSchema,
} from "./scooter-document-extraction.schema";
import type {
  AnalyzeScooterDocumentInput,
  ScooterDocumentExtractionProvider,
} from "./scooter-document-extraction.types";

const VIN = "L5YAUCZB9H1148984";
const OTHER_VIN = "RFBV70010A1100233";
const input: AnalyzeScooterDocumentInput = {
  documentType: "civ",
  contentType: "image/png",
  bytes: Buffer.from("synthetic"),
};
function field(
  field: string,
  value: string | number | null,
  needsReview = false,
  rawValue = value === null ? null : String(value),
) {
  return { field, value, rawValue, needsReview };
}
function setup(
  fields = [field("brandName", "SYNTHETIC")],
  overrides: Record<string, unknown> = {},
) {
  const provider: jest.Mocked<ScooterDocumentExtractionProvider> = {
    analyze: jest.fn().mockResolvedValue({
      detectedDocumentType: "civ",
      vin: VIN,
      fields,
      rawFields: [],
      ...overrides,
    }),
  };
  return { provider, service: new ScooterDocumentExtractionService(provider) };
}

describe("scooter document extraction normalization", () => {
  it.each(v1.scooters.SCOOTER_DOCUMENT_TYPES)(
    "detects %s before applying its field authority",
    (type) => {
      const { service } = setup();
      const output = {
        detectedDocumentType: type,
        vin: VIN,
        fields: [field("registrationNumber", "14949"), field("powerKw", 8)],
        rawFields: [],
      };
      const detected = service.detectType(output);
      expect(detected).toBe(type);
      const normalized = service.normalize(detected, output);
      if (type !== "registration_certificate")
        expect(normalized.extractedData.fields).not.toHaveProperty(
          "registrationNumber",
        );
      if (type === "registration_certificate" || type === "insurance")
        expect(normalized.extractedData.fields).not.toHaveProperty("powerKw");
    },
  );
  it("leaves unrecognizable documents unresolved instead of inventing a category", async () => {
    const { service } = setup();
    await expect(
      Promise.resolve().then(() =>
        service.detectType({
          detectedDocumentType: null,
          vin: null,
          fields: [],
          rawFields: [],
        }),
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_TYPE_UNKNOWN" });
    await expect(
      Promise.resolve().then(() =>
        service.detectType({ detectedDocumentType: "civ" }),
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_FAILED" });
  });

  it("preserves zeroes, confirmed-empty dashes, unknown values and raw formatting", async () => {
    const { service } = setup(
      [
        field("standingCapacity", 0),
        field("maxTrainMassKg", "-"),
        field("actualWeightKg", null),
        field("powerKw", "1,8"),
        field("variant", "00"),
        field("nationalRegistryNumber", " l1b9130200e85k1 "),
      ],
      {
        rawFields: [
          { key: "P.2", value: "1,8" },
          { key: "Mențiuni", value: "retired field" },
        ],
      },
    );
    const result = await service.analyze(input);
    expect(result.extractedData).toMatchObject({
      vin: VIN,
      fields: {
        vin: VIN,
        standingCapacity: 0,
        maxTrainMassKg: "-",
        actualWeightKg: null,
        powerKw: 1.8,
        variant: "00",
        nationalRegistryNumber: "L1B9130200E85K1",
      },
      rawFields: { "P.2": "1,8" },
    });
    expect(result.extractedData.rawFields.Mențiuni).toBe("retired field");
    expect(result.issues).toContainEqual({
      field: "actualWeightKg",
      code: "unreadable",
    });
    expect(result.issues).not.toContainEqual({
      field: "maxTrainMassKg",
      code: "unreadable",
    });
  });

  it("retains valid suggestions when one typed reading is invalid", async () => {
    const { service } = setup([
      field("brandName", "AGM"),
      field("manufactureYear", "unreadable"),
      field("vehicleCategory", "not-an-enum"),
      field("powerKw", 1.8),
    ]);
    const result = await service.analyze(input);
    expect(result.extractedData.fields).toMatchObject({
      brandName: "AGM",
      manufactureYear: null,
      vehicleCategory: null,
      powerKw: 1.8,
    });
    expect(result.extractedData.rawFields.manufactureYear).toBe("unreadable");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { field: "manufactureYear", code: "invalidValue" },
        { field: "vehicleCategory", code: "invalidValue" },
      ]),
    );
  });

  it("normalizes printed dates, validates calendar dates and rejects future CIV issue dates", async () => {
    const { service } = setup([field("civIssuedAt", "20.08.2020")]);
    expect(
      (await service.analyze(input)).extractedData.fields.civIssuedAt,
    ).toBe("2020-08-20");
    for (const date of ["31.02.2020", "2999-01-01"]) {
      const invalid = setup([field("civIssuedAt", date)]);
      expect((await invalid.service.analyze(input)).issues).toContainEqual({
        field: "civIssuedAt",
        code: "invalidValue",
      });
    }
  });

  it("marks uncertain readings even when their normalized value passes validation", async () => {
    const { service } = setup([field("engineCode", "BN139QMB", true)]);
    const result = await service.analyze(input);
    expect(result.extractedData.fields.engineCode).toBe("BN139QMB");
    expect(result.issues).toContainEqual({
      field: "engineCode",
      code: "unreadable",
    });
  });

  it("does not choose among conflicting repeated values", async () => {
    const { service } = setup([
      field("engineCode", "FIRST"),
      field("engineCode", "SECOND"),
      field("engineCode", "SECOND"),
    ]);
    const result = await service.analyze(input);
    expect(result.extractedData.fields.engineCode).toBeNull();
    expect(result.issues).toContainEqual({
      field: "engineCode",
      code: "conflictingValues",
    });
  });

  it("keeps a raw rubric conflict unresolved after later repetitions", async () => {
    const { service } = setup([field("civVersion", "2024")], {
      rawFields: [
        { key: "K", value: "first" },
        { key: "K", value: "second" },
        { key: "K", value: "first" },
      ],
    });
    const result = await service.analyze(input);
    expect(result.extractedData.rawFields.K).toBeNull();
    expect(result.issues).toContainEqual({
      field: "typeApprovalNumber",
      code: "conflictingValues",
    });
    expect(result.extractedData.vin).toBe(VIN);
  });

  it.each([null, "", "-"])(
    "uses an explicit raw dash as confirmed empty when normalized value is %s",
    async (value) => {
      const { service } = setup([field("actualWeightKg", value, true, "-")]);
      const result = await service.analyze(input);
      expect(result.extractedData.fields.actualWeightKg).toBe("-");
      expect(result.extractedData.rawFields.actualWeightKg).toBe("-");
      expect(
        result.issues.some((issue) => issue.field === "actualWeightKg"),
      ).toBe(false);
    },
  );

  it("flags a populated value contradicting its raw dash", async () => {
    const { service } = setup([field("actualWeightKg", 100, false, "-")]);
    const result = await service.analyze(input);
    expect(result.extractedData.fields.actualWeightKg).toBeNull();
    expect(result.issues).toContainEqual({
      field: "actualWeightKg",
      code: "conflictingValues",
    });
  });

  it.each(["civ", "insurance"] as const)(
    "requires explicit VIN review for uncertain %s VIN suggestions",
    async (documentType) => {
      const { service } = setup(
        [
          field(
            documentType === "insurance" ? "documentVin" : "vin",
            VIN,
            true,
          ),
        ],
        { detectedDocumentType: documentType },
      );
      const result = await service.analyze({ ...input, documentType });
      expect(result.extractedData.vin).toBeNull();
      expect(
        result.extractedData.fields[
          documentType === "insurance" ? "documentVin" : "vin"
        ],
      ).toBeNull();
      expect(result.issues).toContainEqual({
        field: "vin",
        code: "unreadable",
      });
    },
  );

  it.each(["E", "E Numar de identificare (VIN)", "VIN"])(
    "requires manual VIN review when raw %s readings conflict",
    async (key) => {
      const { service } = setup([field("vin", VIN)], {
        rawFields: [
          { key, value: VIN },
          { key, value: OTHER_VIN },
        ],
      });
      const result = await service.analyze(input);
      expect(result.extractedData.vin).toBeNull();
      expect(result.extractedData.fields.vin).toBeNull();
      expect(result.issues).toContainEqual({
        field: "vin",
        code: "conflictingValues",
      });
    },
  );

  it("compares VIN evidence even when contradictory readings use different raw labels", async () => {
    const { service } = setup([field("vin", VIN)], {
      rawFields: [
        { key: "E Numar de identificare (VIN)", value: VIN },
        { key: "E VIN", value: OTHER_VIN },
      ],
    });
    const result = await service.analyze(input);
    expect(result.extractedData.vin).toBeNull();
    expect(result.issues).toContainEqual({
      field: "vin",
      code: "conflictingValues",
    });
  });

  it("preserves equal zeroes and dashes independently unless their exact CIV rubric already contains the reading", async () => {
    const { service } = setup(
      [
        field("civVersion", "2024"),
        field("standingCapacity", 0),
        field("powerToWeightRatioKwKg", 0),
        field("maxTrainMassKg", "-"),
        field("actualWeightKg", "-"),
      ],
      { rawFields: [{ key: "S.2", value: "0" }] },
    );
    const result = await service.analyze(input);
    expect(result.extractedData.rawFields).toMatchObject({
      "S.2": "0",
      powerToWeightRatioKwKg: "0",
      maxTrainMassKg: "-",
      actualWeightKg: "-",
    });
    expect(result.extractedData.rawFields).not.toHaveProperty(
      "standingCapacity",
    );
  });

  it("marks omitted critical fields unknown without inventing optional inapplicable fields", async () => {
    const { service } = setup([]);
    const result = await service.analyze(input);
    expect(result.extractedData.fields).toEqual({
      vin: VIN,
      brandName: null,
      powertrainType: null,
      civIssuedAt: null,
    });
    expect(result.issues).toEqual([
      { field: "brandName", code: "unreadable" },
      { field: "powertrainType", code: "unreadable" },
      { field: "civIssuedAt", code: "unreadable" },
    ]);
    expect(result.extractedData.fields).not.toHaveProperty(
      "electricMotorPowerKw",
    );
  });

  it("does not flag valid CIV readings when labelled rubric evidence fills the raw-field limit", async () => {
    const { service } = setup(
      [
        field("civVersion", "2024"),
        field("brandName", "SYNTHETIC"),
        field("powertrainType", "combustion"),
        field("color", "Negru"),
        field("seatsCount", 2),
        field("standingCapacity", 0),
      ],
      {
        rawFields: [
          { key: "vin", value: VIN },
          { key: "civVersion", value: "2024" },
          { key: "brandName", value: "SYNTHETIC" },
          { key: "powertrainType", value: "combustion" },
          { key: "R. Culoare vehicul", value: "Negru" },
          { key: "S.1. Număr locuri", value: "2" },
          { key: "S.2. Număr locuri în picioare", value: "0" },
          ...Array.from({ length: 93 }, (_, index) => ({
            key: `unmapped-${index}`,
            value: "0",
          })),
        ],
      },
    );
    const result = await service.analyze(input);
    expect(result.issues).toEqual([
      { field: "civIssuedAt", code: "unreadable" },
    ]);
    expect(result.extractedData.fields).toMatchObject({
      color: "Negru",
      seatsCount: 2,
      standingCapacity: 0,
    });
    expect(Object.keys(result.extractedData.rawFields)).toHaveLength(100);
    expect(result.extractedData.rawFields).not.toHaveProperty("color");
    expect(result.extractedData.rawFields["R. Culoare vehicul"]).toBe("Negru");
  });

  it("requires explicit VIN review for missing and invalid VINs", async () => {
    for (const vin of [null, "-", "HAS-LETTER-I-INVALID"]) {
      const { service } = setup([], { vin });
      const result = await service.analyze(input);
      expect(result.extractedData.vin).toBeNull();
      expect(result.issues.some((issue) => issue.field === "vin")).toBe(true);
    }
  });

  it("does not hide a conflicting VIN inside the same document", async () => {
    const { service } = setup([field("vin", OTHER_VIN)]);
    const result = await service.analyze(input);
    expect(result.extractedData).toMatchObject({
      vin: null,
      fields: { vin: null },
    });
    expect(result.issues).toContainEqual({
      field: "vin",
      code: "conflictingValues",
    });
  });

  it.each(["civ", "insurance"] as const)(
    "does not silently change Z/2 between the raw and normalized %s VIN",
    async (documentType) => {
      const key = documentType === "insurance" ? "documentVin" : "vin";
      const { service } = setup(
        [field(key, VIN, false, VIN.replace("Z", "2"))],
        { detectedDocumentType: documentType },
      );
      const result = await service.analyze({ ...input, documentType });
      expect(result.extractedData.vin).toBeNull();
      expect(result.extractedData.fields[key]).toBeNull();
      expect(result.issues).toContainEqual({
        field: "vin",
        code: "conflictingValues",
      });
    },
  );

  it("returns no suggestions for the wrong document type", async () => {
    const { service } = setup([field("brandName", "AGM")], {
      detectedDocumentType: "insurance",
    });
    expect(await service.analyze(input)).toEqual({
      extractedData: { vin: null, fields: {}, rawFields: {} },
      issues: [{ field: "vin", code: "typeMismatch" }],
    });
  });

  it("keeps import facts separate from CIV metadata and current registration", async () => {
    const { service } = setup(
      [
        field("brandName", "AGM"),
        field("civNumber", "T123"),
        field("registrationNumber", "AB1234"),
      ],
      { detectedDocumentType: "import_document" },
    );
    const result = await service.analyze({
      ...input,
      documentType: "import_document",
    });
    expect(result.extractedData.fields).toEqual({
      brandName: "AGM",
      vin: VIN,
      powertrainType: null,
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { field: "civNumber", code: "invalidValue" },
        { field: "registrationNumber", code: "invalidValue" },
      ]),
    );
  });

  it("does not include technical facts or operation data in insurance results", async () => {
    const { service } = setup(
      [field("insuredName", "TEST INSURED"), field("powerKw", 50)],
      { detectedDocumentType: "insurance" },
    );
    const result = await service.analyze({
      ...input,
      documentType: "insurance",
    });
    expect(result.extractedData.fields).toMatchObject({
      insuredName: "TEST INSURED",
    });
    expect(result.extractedData.fields).not.toHaveProperty("powerKw");
    expect(result.issues).toContainEqual({
      field: "powerKw",
      code: "invalidValue",
    });
  });

  it("normalizes insurance premium/currency and flags reversed coverage dates", async () => {
    const { service } = setup(
      [
        field("insuredName", "TEST INSURED"),
        field("validFrom", "13.09.2020"),
        field("validUntil", "12.09.2020"),
        field("premiumAmount", "278,88"),
        field("currency", "Lei"),
        field("documentVin", VIN),
      ],
      { detectedDocumentType: "insurance" },
    );
    const result = await service.analyze({
      ...input,
      documentType: "insurance",
    });
    expect(result.extractedData.fields).toMatchObject({
      insuredName: "TEST INSURED",
      validFrom: "2020-09-13",
      validUntil: null,
      premiumAmount: 278.88,
      currency: "RON",
      documentVin: VIN,
    });
    expect(result.issues).toEqual([
      { field: "validUntil", code: "invalidValue" },
    ]);
  });

  it("does not import incompatible powertrain fields or unpaired other classifications", async () => {
    const { service } = setup([
      field("powertrainType", "combustion"),
      field("electricMotorPowerKw", 2),
      field("fuelType", "electric"),
      field("bodyType", "other"),
      field("nationalCategoryOther", "Unpaired"),
    ]);
    const result = await service.analyze(input);
    expect(result.extractedData.fields).toMatchObject({
      powertrainType: "combustion",
      electricMotorPowerKw: null,
      fuelType: null,
      bodyType: null,
      nationalCategoryOther: null,
    });
    expect(result.issues).toContainEqual({
      field: "bodyTypeOther",
      code: "unreadable",
    });
  });

  it("validates registration plates and preserves the certificate number separately", async () => {
    const { service } = setup(
      [
        field("registrationType", "national"),
        field("registrationNumber", "wrong"),
        field("registrationCertificateNumber", "SERIAL-001"),
        field("temporaryRegistrationExpiresAt", "2020-01-01"),
      ],
      { detectedDocumentType: "registration_certificate" },
    );
    const result = await service.analyze({
      ...input,
      documentType: "registration_certificate",
    });
    expect(result.extractedData.fields).toMatchObject({
      registrationType: "national",
      registrationNumber: null,
      registrationCertificateNumber: "SERIAL-001",
      temporaryRegistrationExpiresAt: null,
    });
  });

  it("never infers a licence category from engine displacement or power", async () => {
    const { service } = setup([
      field("engineDisplacementCc", 50),
      field("powerKw", 1.8),
    ]);
    expect(
      (await service.analyze(input)).extractedData.fields,
    ).not.toHaveProperty("requiredLicenseCategory");
  });

  it("bounds raw evidence and ignores unsafe object keys", async () => {
    const { service } = setup([field("brandName", "SYNTHETIC")], {
      rawFields: [
        { key: "__proto__", value: "unsafe" },
        ...Array.from({ length: 99 }, (_, index) => ({
          key: `rubric-${index}`,
          value: String(index),
        })),
      ],
    });
    const result = await service.analyze(input);
    expect(Object.keys(result.extractedData.rawFields)).toHaveLength(100);
    expect(Object.hasOwn(result.extractedData.rawFields, "__proto__")).toBe(
      false,
    );
  });

  it("rejects malformed provider shape rather than trusting extra operational fields", async () => {
    const { service } = setup([field("currentMileageKm", 100)]);
    await expect(service.analyze(input)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_FAILED",
    });
  });

  it.each([
    [{ bytes: Buffer.alloc(0) }, "DOCUMENT_EXTRACTION_INVALID_SOURCE"],
    [
      { bytes: Buffer.alloc(v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES + 1) },
      "DOCUMENT_EXTRACTION_TOO_LARGE",
    ],
    [{ contentType: "text/plain" }, "DOCUMENT_EXTRACTION_UNSUPPORTED_DOCUMENT"],
  ])(
    "rejects unsupported sources before calling the provider",
    async (patch, code) => {
      const { provider, service } = setup();
      await expect(
        service.analyze({
          ...input,
          ...(patch as Partial<AnalyzeScooterDocumentInput>),
        }),
      ).rejects.toMatchObject({ code });
      expect(provider.analyze).not.toHaveBeenCalled();
    },
  );

  it("has a closed, required, transform-free strict model schema", () => {
    const inspect = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      const object = value as Record<string, unknown>;
      if (object.type === "object") {
        expect(object.additionalProperties).toBe(false);
        expect(new Set(object.required as string[])).toEqual(
          new Set(Object.keys(object.properties as object)),
        );
      }
      for (const child of Object.values(object)) inspect(child);
    };
    inspect(scooterDocumentModelJsonSchema);
    expect(extractionFieldsForType("civ")).not.toContain("propulsionSystem");
    expect(extractionFieldsForType("insurance")).toEqual([
      ...v1.scooters.INSURANCE_FIELDS,
    ]);
  });
});

describe("mixed document PDFs", () => {
  const document = (
    documentType: v1.scooters.ScooterDocumentType,
    fields: ReturnType<typeof field>[],
    pages = [1],
    vin: string | null = VIN,
  ) => ({
    documentType,
    fields,
    pages,
    vin,
    rawFields: [],
    regions: [],
    inspections: [],
  });
  function normalize(documents: unknown[]) {
    const { service } = setup();
    const output = {
      detectedDocumentType: null,
      vin: null,
      fields: [],
      rawFields: [],
      documents,
    };
    return {
      type: service.detectType(output),
      ...service.normalize(service.detectType(output), output),
    };
  }
  it("retains both Dutch card sides and separate export evidence alongside authoritative CIV facts", () => {
    const result = normalize([
      document(
        "foreign_registration",
        [
          field("powerKw", 3),
          field("foreignRegistrationNumber", "D-123-AB"),
          field("foreignFirstRegistrationDate", "12.03.2018"),
        ],
        [1, 2],
      ),
      document(
        "export_certificate",
        [
          field("exportDate", "20.08.2024"),
          field("exportCertificateNumber", "00042"),
        ],
        [3],
      ),
      document(
        "civ",
        [field("powerKw", 4), field("civIssuedAt", "01.09.2024")],
        [4],
      ),
    ]);
    expect(result.type).toBe("civ");
    expect(result.extractedData.fields).toMatchObject({
      powerKw: 4,
      foreignRegistrationNumber: "D-123-AB",
      foreignFirstRegistrationDate: "2018-03-12",
      exportDate: "2024-08-20",
    });
    expect(result.extractedData.fields).not.toHaveProperty(
      "registrationNumber",
    );
    expect(result.extractedData.documents).toHaveLength(3);
    expect(result.extractedData.documents?.[0]).toMatchObject({
      pages: [1, 2],
      fields: { powerKw: 3 },
    });
    expect(result.issues).toContainEqual({
      field: "powerKw",
      code: "conflictingValues",
    });
  });
  it("keeps conflicting facts separate while selecting the CIV VIN over foreign readings", () => {
    const conflicted = normalize([
      document("civ", [field("powerKw", 4)]),
      document(
        "foreign_registration",
        [field("brandName", "OTHER")],
        [2],
        OTHER_VIN,
      ),
    ]);
    expect(conflicted.extractedData.vin).toBe(VIN);
    expect(conflicted.extractedData.fields).toEqual({ vin: VIN });
    expect(conflicted.issues).toContainEqual({
      field: "vin",
      code: "conflictingValues",
    });
    const uncertain = normalize([
      document("civ", [field("powerKw", 4)]),
      document(
        "foreign_registration",
        [field("brandName", "OTHER")],
        [2],
        null,
      ),
    ]);
    expect(uncertain.extractedData.vin).toBe(VIN);
    expect(uncertain.extractedData.documents?.[0].vin).toBe(VIN);
  });
  it("keeps same-page logical records and requires the CIV authority issue date", () => {
    const result = normalize([
      {
        ...document("civ", []),
        regions: [{ page: 1, x: 0, y: 0, width: 1, height: 0.5 }],
      },
      {
        ...document("registration_certificate", [
          field("registrationLocalityCode", "18"),
          field("registrationCounty", "VL"),
          field("registrationNumber", "VL 18 167"),
        ]),
        regions: [{ page: 1, x: 0, y: 0.5, width: 1, height: 0.5 }],
      },
    ]);
    expect(result.issues).toContainEqual({
      field: "civIssuedAt",
      code: "unreadable",
    });
    expect(result.extractedData.documents?.[1].fields).toMatchObject({
      registrationLocalityCode: "18",
      registrationCounty: "VL",
      registrationNumber: "VL 18 167",
    });
    expect(result.extractedData.documents?.[0].regions?.[0].height).toBe(0.5);
  });
  it("supports twenty complete logical records and rejects a twenty-first", () => {
    const output = {
      detectedDocumentType: "civ",
      vin: null,
      fields: [],
      rawFields: [],
      documents: Array.from({ length: 20 }, () => document("civ", [])),
    };
    expect(scooterDocumentModelOutputSchema.safeParse(output).success).toBe(
      true,
    );
    output.documents.push(document("civ", []));
    expect(scooterDocumentModelOutputSchema.safeParse(output).success).toBe(
      false,
    );
  });
  it("rejects mappings beyond the original page count while preserving legacy jobs", () => {
    const { service } = setup();
    const output = {
      detectedDocumentType: "civ",
      vin: null,
      fields: [],
      rawFields: [],
      documents: [document("civ", [], [2])],
    };
    expect(() => service.normalize("civ", output, 1)).toThrow();
    expect(() => service.normalize("civ", output, 0)).toThrow();
    expect(() => service.normalize("civ", output, 2)).not.toThrow();
    expect(() => service.normalize("civ", output)).not.toThrow();
    const regionsOutput = {
      ...output,
      documents: [
        {
          ...document("civ", [], [1]),
          regions: [{ page: 2, x: 0, y: 0, width: 1, height: 1 }],
        },
      ],
    };
    expect(() => service.normalize("civ", regionsOutput, 1)).toThrow();
  });
  it("retains malformed child VIN warnings while selecting the readable CIV VIN", () => {
    const { service } = setup();
    for (const malformed of [
      "INVALID",
      "L5YAUCZB9H114898I",
      "L5YAUCZB9H1148984?",
    ]) {
      const output = {
        detectedDocumentType: "civ",
        vin: VIN,
        fields: [field("vin", VIN)],
        rawFields: [],
        documents: [
          document("civ", [field("vin", VIN)]),
          document("foreign_registration", [], [1], malformed),
        ],
      };
      const result = service.normalize("civ", output, 1);
      expect(result.extractedData.vin).toBe(VIN);
      expect(result.issues).toContainEqual({
        field: "vin",
        code: "invalidValue",
      });
    }
  });
  it("normalizes each ITP row independently, preserves raw dates and never infers a missing expiry", () => {
    const result = normalize([
      {
        ...document("itp_card", []),
        inspections: [
          {
            inspectionDate: "12.03.2024",
            validUntil: "12.03.2026",
            result: "passed",
            certificateNumber: "000123",
            odometerKm: 42,
            rawFields: [{ key: "valabil", value: "12.03.2026" }],
          },
          {
            inspectionDate: "15.03.2026",
            validUntil: null,
            result: null,
            certificateNumber: null,
            odometerKm: null,
            rawFields: [],
          },
        ],
      },
    ]);
    expect(result.extractedData.documents?.[0].inspections?.[0]).toMatchObject({
      inspectionDate: "2024-03-12",
      validUntil: "2026-03-12",
      result: "passed",
      rawFields: { valabil: "12.03.2026" },
    });
    expect(
      result.extractedData.documents?.[0].inspections?.[1].validUntil,
    ).toBeNull();
    expect(result.issues).toContainEqual({
      field: "inspections.1.validUntil",
      code: "unreadable",
    });
  });
});

it.each(["registration_certificate", "itp_card"] as const)(
  "discards all attempted VIN extraction from %s",
  (type) => {
    const { service } = setup();
    const result = service.normalize(type, {
      detectedDocumentType: type,
      vin: VIN,
      fields: [field("vin", VIN)],
      rawFields: [
        { key: "vin", value: VIN },
        { key: "E", value: VIN },
        { key: "Număr de identificare", value: VIN },
      ],
      documents: null,
    });
    expect(result.extractedData.vin).toBeNull();
    expect(result.extractedData.fields).not.toHaveProperty("vin");
    expect(result.extractedData.rawFields).not.toHaveProperty("vin");
    expect(result.issues.some((issue) => issue.field === "vin")).toBe(false);
  },
);
