import { v1 } from "@repo/api-shared";
import { ScooterDocumentExtractionService } from "./scooter-document-extraction.service";
import {
  extractionFieldsForType,
  scooterDocumentModelJsonSchema,
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
    expect(result.extractedData.rawFields).not.toHaveProperty("Mențiuni");
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
    });
    expect(result.issues).toEqual([
      { field: "brandName", code: "unreadable" },
      { field: "powertrainType", code: "unreadable" },
    ]);
    expect(result.extractedData.fields).not.toHaveProperty(
      "electricMotorPowerKw",
    );
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

  it.each(["civ", "registration_certificate", "insurance"] as const)(
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
