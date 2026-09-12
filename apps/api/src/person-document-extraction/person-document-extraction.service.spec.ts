import { PersonDocumentExtractionService } from "./person-document-extraction.service";
import type { AnalyzePersonDocumentInput } from "./person-document-extraction.types";

const input: AnalyzePersonDocumentInput = {
  documentType: "nationalId",
  sources: [
    { slot: "front", contentType: "image/jpeg", bytes: Buffer.from("fixture") },
    { slot: "back", contentType: "image/png", bytes: Buffer.from("reverse") },
  ],
};

function suggestion(
  target: "person" | "document",
  field: string,
  value: string,
  sourceSlot = "front",
) {
  return { target, field, value, sourceSlot, needsReview: false };
}

function category(
  category: string,
  issuedOn: string | null,
  expiresOn: string | null,
) {
  return {
    value: { category, issuedOn, expiresOn, restrictions: null },
    sourceSlot: "back",
    needsReview: false,
  };
}

function setup(overrides: Record<string, unknown> = {}) {
  const provider = {
    analyze: jest.fn().mockResolvedValue({
      detectedDocumentType: "nationalId",
      suggestions: [],
      licenseCategories: [],
      warnings: [],
      ...overrides,
    }),
  };
  return { provider, service: new PersonDocumentExtractionService(provider) };
}

describe("person-document extraction normalization", () => {
  it("preserves Romanian spelling, separates CNP and document number, and normalizes country codes", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("person", "firstName", " Ștefan "),
        suggestion("person", "lastName", "Popescu"),
        suggestion("person", "dateOfBirth", "1990-02-28"),
        suggestion("document", "cnp", "190 022 812 3450"),
        suggestion("document", "number", "001234"),
        suggestion("document", "series", "AB"),
        suggestion("document", "issuingCountryCode", "ro"),
      ],
    });
    const result = await service.analyze(input);

    expect(result.suggestions.map((item) => [item.field, item.value])).toEqual([
      ["firstName", "Ștefan"],
      ["lastName", "Popescu"],
      ["dateOfBirth", "1990-02-28"],
      ["cnp", "1900228123450"],
      ["number", "001234"],
      ["series", "AB"],
      ["issuingCountryCode", "RO"],
    ]);
    expect(result.warnings).toEqual([]);
    expect(result).not.toHaveProperty("status");
  });

  it("splits printed county and locality labels with source attribution", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("person", "region", "Jud.VL Mun.RÂMNICU VÂLCEA", "back"),
        suggestion(
          "person",
          "addressLine1",
          "Jud.VL Mun.RÂMNICU VÂLCEA Str.Exemplu Nr.12",
          "back",
        ),
      ],
    });
    const result = await service.analyze(input);
    expect(result.suggestions).toEqual([
      suggestion("person", "region", "Vâlcea", "back"),
      suggestion("person", "city", "Râmnicu Vâlcea", "back"),
      suggestion(
        "person",
        "addressLine1",
        "Jud.VL Mun.RÂMNICU VÂLCEA Str.Exemplu Nr.12",
        "back",
      ),
    ]);
  });

  it("preserves conflicting locality sources for manual review", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("person", "addressLine1", "Jud.VL Mun.Râmnicu Vâlcea"),
        suggestion("person", "city", "Drăgășani", "back"),
      ],
    });
    const result = await service.analyze(input);
    expect(result.warnings).toContain("conflictingSources");
    expect(result.suggestions.filter((item) => item.field === "city")).toEqual([
      { ...suggestion("person", "city", "Râmnicu Vâlcea"), needsReview: true },
      {
        ...suggestion("person", "city", "Drăgășani", "back"),
        needsReview: true,
      },
    ]);
  });

  it("keeps a plain city whose name also matches a county", async () => {
    const { service } = setup({
      suggestions: [suggestion("person", "city", "IAȘI")],
    });
    const result = await service.analyze(input);
    expect(result.suggestions).toEqual([suggestion("person", "city", "Iași")]);
  });

  it("also parses Romanian residence proofs for foreign citizens", async () => {
    const { service } = setup({
      detectedDocumentType: "proofOfAddress",
      suggestions: [
        suggestion(
          "person",
          "addressLine1",
          "Jud.CJ Com.Florești Sat.Luna de Sus Str.Principală",
        ),
      ],
    });
    const result = await service.analyze({
      ...input,
      documentType: "proofOfAddress",
    });
    expect(result.suggestions).toContainEqual(
      suggestion("person", "region", "Cluj"),
    );
    expect(
      result.suggestions.find((item) => item.field === "city")?.value,
    ).toMatch(/^Luna [Dd]e Sus$/u);
  });

  it("retains conflict warnings when expanded address suggestions reach the response limit", async () => {
    const { service } = setup({
      suggestions: [
        ...Array.from({ length: 63 }, (_, index) =>
          suggestion("person", "firstName", `Name${index}`),
        ),
        suggestion("person", "addressLine1", "Jud.VL Mun.Râmnicu Vâlcea"),
      ],
    });
    const result = await service.analyze(input);
    expect(result.suggestions).toHaveLength(64);
    expect(result.warnings).toEqual(
      expect.arrayContaining(["invalidValue", "conflictingSources"]),
    );
    expect(
      result.suggestions
        .filter((item) => item.field === "firstName")
        .every((item) => item.needsReview),
    ).toBe(true);
  });

  it("does not reinterpret foreign addresses as Romanian counties", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("person", "countryCode", "IT"),
        suggestion("person", "region", "AB"),
        suggestion("person", "city", "Alba"),
      ],
    });
    const result = await service.analyze(input);
    expect(result.suggestions).toContainEqual(
      suggestion("person", "region", "AB"),
    );
    expect(result.suggestions).toContainEqual(
      suggestion("person", "city", "Alba"),
    );
  });

  it("keeps good fields while omitting invalid CNP, date, future issue date and unknown country", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("person", "firstName", "Ana"),
        suggestion("document", "cnp", "1234567890123"),
        suggestion("document", "expiresOn", "2027-02-30"),
        suggestion("document", "issuedOn", "2999-01-01"),
        suggestion("person", "dateOfBirth", "2999-01-01"),
        suggestion("person", "countryCode", "ZZ"),
      ],
    });
    const result = await service.analyze(input);
    expect(result.suggestions).toEqual([
      suggestion("person", "firstName", "Ana"),
    ]);
    expect(result.warnings).toEqual(["invalidValue"]);
  });

  it("omits a conflicting CNP and birth date rather than choosing an identity", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("document", "cnp", "1900228123450"),
        suggestion("person", "dateOfBirth", "1990-03-01"),
      ],
    });
    const result = await service.analyze(input);
    expect(result.suggestions).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining(["conflictingSources", "noData"]),
    );
  });

  it("omits inconsistent document issue and expiry dates", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("document", "issuedOn", "2025-01-01"),
        suggestion("document", "expiresOn", "2024-01-01"),
      ],
    });
    expect(await service.analyze(input)).toMatchObject({
      suggestions: [],
      warnings: ["invalidValue", "noData"],
    });
  });

  it("preserves competing readings and flags both for review", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("person", "firstName", "Ana"),
        suggestion("person", "firstName", "Anca", "back"),
      ],
    });
    const result = await service.analyze(input);
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions.every((item) => item.needsReview)).toBe(true);
    expect(result.warnings).toEqual(["conflictingSources"]);
  });

  it.each([
    [false, true],
    [true, false],
  ])(
    "preserves review flags when deduplicating identical readings (%s, %s)",
    async (firstNeedsReview, secondNeedsReview) => {
      const reading = suggestion("person", "firstName", "Ana");
      const { service } = setup({
        suggestions: [
          { ...reading, needsReview: firstNeedsReview },
          { ...reading, needsReview: secondNeedsReview },
        ],
      });

      const result = await service.analyze(input);

      expect(result.suggestions).toEqual([{ ...reading, needsReview: true }]);
      expect(result.warnings).toEqual([]);
    },
  );

  it.each(["passport", null])(
    "returns no suggestions when actual type is %s",
    async (detectedDocumentType) => {
      const { service } = setup({
        detectedDocumentType,
        suggestions: [suggestion("person", "firstName", "Ana")],
      });
      expect(await service.analyze(input)).toMatchObject({
        suggestions: [],
        licenseCategories: [],
        warnings: [detectedDocumentType ? "typeMismatch" : "noData"],
      });
    },
  );

  it("rejects unrecognized fields, verified status, and source slots absent from the input", async () => {
    const { service, provider } = setup({ status: "verified" });
    await expect(service.analyze(input)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_FAILED",
    });
    provider.analyze.mockResolvedValue({
      detectedDocumentType: "nationalId",
      suggestions: [suggestion("document", "status", "verified")],
      licenseCategories: [],
      warnings: [],
    });
    await expect(service.analyze(input)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_FAILED",
    });
    provider.analyze.mockResolvedValue({
      detectedDocumentType: "nationalId",
      suggestions: [suggestion("person", "firstName", "Ana", "other")],
      licenseCategories: [],
      warnings: [],
    });
    await expect(service.analyze(input)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_INVALID_SOURCE",
    });
  });

  it("accepts dated licence rows for review and omits undated templates/invalid categories/invalid dates", async () => {
    const { service } = setup({
      detectedDocumentType: "driverLicense",
      licenseCategories: [
        category("AM", "2010-02-01", "2030-02-01"),
        category("A", null, null),
        category("UNKNOWN", "2010-02-01", "2030-02-01"),
        category("B", "2010-02-31", "2030-02-01"),
        category("C", "2030-02-01", "2020-02-01"),
      ],
    });
    const result = await service.analyze({
      ...input,
      documentType: "driverLicense",
    });
    expect(result.licenseCategories).toEqual([
      { ...category("AM", "2010-02-01", "2030-02-01"), needsReview: true },
    ]);
    expect(result.warnings).toEqual(["invalidValue"]);
  });

  it("omits contradictory licence rows instead of selecting the first date", async () => {
    const { service } = setup({
      detectedDocumentType: "driverLicense",
      licenseCategories: [
        category("AM", "2010-02-01", "2030-02-01"),
        category("AM", "2010-02-01", "2020-02-01"),
      ],
    });
    const result = await service.analyze({
      ...input,
      documentType: "driverLicense",
    });
    expect(result.licenseCategories).toEqual([]);
    expect(result.warnings).toEqual(["conflictingSources", "noData"]);
  });

  it("does not accept licence categories extracted from an identity document", async () => {
    const { service } = setup({
      licenseCategories: [category("AM", "2010-02-01", "2030-02-01")],
    });
    expect(await service.analyze(input)).toMatchObject({
      licenseCategories: [],
      warnings: ["invalidValue", "noData"],
    });
  });

  it("rejects empty, duplicate, unsupported or oversized sources before invoking the provider", async () => {
    const { service, provider } = setup();
    await expect(
      service.analyze({ ...input, sources: [] }),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_INVALID_SOURCE" });
    await expect(
      service.analyze({
        ...input,
        sources: [input.sources[0], input.sources[0]],
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_INVALID_SOURCE" });
    await expect(
      service.analyze({
        ...input,
        sources: [
          { ...input.sources[0], bytes: Buffer.alloc(10 * 1024 * 1024 + 1) },
        ],
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_TOO_LARGE" });
    await expect(
      service.analyze({
        ...input,
        sources: [{ ...input.sources[0], contentType: "application/pdf" }],
      }),
    ).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_UNSUPPORTED_DOCUMENT",
    });
    expect(provider.analyze).not.toHaveBeenCalled();
  });
});
