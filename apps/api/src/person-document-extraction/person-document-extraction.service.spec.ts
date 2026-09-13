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

function setup(
  overrides: Record<string, unknown> & {
    suggestions?: Array<
      ReturnType<typeof suggestion> & { addressEvidence?: unknown }
    >;
  } = {},
) {
  const provider = {
    analyze: jest.fn().mockResolvedValue({
      detectedDocumentType: "nationalId",
      licenseCategories: [],
      warnings: [],
      ...overrides,
      suggestions: (overrides.suggestions ?? []).map((item) =>
        item.target === "person"
          ? {
              addressEvidence: [
                "countryCode",
                "region",
                "city",
                "addressLine1",
                "addressLine2",
              ].includes(item.field)
                ? { section: "domicile", label: "Domiciliu" }
                : null,
              ...item,
            }
          : item,
      ),
    }),
  };
  return { provider, service: new PersonDocumentExtractionService(provider) };
}

describe("person-document extraction normalization", () => {
  it.each(["nationalId", "other", null])(
    "reads a CEI domicile certificate PDF even when the model labels it %s",
    async (detectedDocumentType) => {
      const { service } = setup({
        detectedDocumentType,
        warnings: ["typeMismatch"],
        suggestions: [
          suggestion("person", "firstName", "ANA-MARIA"),
          suggestion("person", "lastName", "EXEMPLU"),
          suggestion("person", "cnp", "1900228123450"),
          suggestion("person", "countryCode", "RO"),
          suggestion("person", "region", "CJ"),
          suggestion("person", "city", "Florești"),
          suggestion("person", "addressLine1", "Str. Exemplu Nr.12"),
          suggestion("document", "number", "CERTIFICATE-123"),
          suggestion("document", "expiresOn", "2030-01-01"),
        ],
      });
      const result = await service.analyze({
        documentType: "proofOfAddress",
        sources: [
          {
            slot: "front",
            contentType: "application/pdf",
            bytes: Buffer.from("%PDF-certificate-fixture"),
          },
        ],
      });
      expect(result.detectedDocumentType).toBe("proofOfAddress");
      expect(result.warnings).not.toContain("typeMismatch");
      expect(result.suggestions).toEqual(
        expect.arrayContaining([
          suggestion("person", "firstName", "Ana-Maria"),
          suggestion("person", "lastName", "Exemplu"),
          suggestion("person", "cnp", "1900228123450"),
          suggestion("person", "dateOfBirth", "1990-02-28"),
          suggestion("person", "countryCode", "RO"),
          suggestion("person", "region", "Cluj"),
          suggestion("person", "city", "Florești"),
          suggestion("person", "addressLine1", "Str. Exemplu, Nr. 12"),
        ]),
      );
      expect(result.suggestions.every((item) => item.target === "person")).toBe(
        true,
      );
    },
  );

  it.each([
    null,
    { section: "birthplace", label: "Loc naștere" },
    { section: "issuer", label: "Adresa emitentului" },
    { section: "domicile", label: "Locul nașterii" },
    { section: "domicile", label: "Sediul emitentului" },
  ])(
    "does not accept unrelated PDFs as address proof without residential evidence (%j)",
    async (addressEvidence) => {
      const { service } = setup({
        detectedDocumentType: "nationalId",
        warnings: ["typeMismatch"],
        suggestions: [
          suggestion("person", "firstName", "Ana"),
          {
            ...suggestion("person", "addressLine1", "Str. Exemplu Nr.12"),
            addressEvidence,
          },
        ],
      });
      const result = await service.analyze({
        ...input,
        documentType: "proofOfAddress",
      });
      expect(result.suggestions).toEqual([]);
      expect(result.warnings).toContain("typeMismatch");
    },
  );

  it("does not accept a name and country alone as proof of residence", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("person", "firstName", "Ana"),
        suggestion("person", "countryCode", "RO"),
      ],
    });
    const result = await service.analyze({
      ...input,
      documentType: "proofOfAddress",
    });
    expect(result.suggestions).toEqual([]);
    expect(result.warnings).toContain("typeMismatch");
  });

  it("uses the second Domiciliu address on a classic ID without mixing in the birthplace county", async () => {
    const { service } = setup({
      suggestions: [
        {
          ...suggestion("person", "region", "Jud.VL Mun.Râmnicu Vâlcea"),
          addressEvidence: {
            section: "birthplace",
            label: "Loc naștere / Place of birth",
          },
        },
        {
          ...suggestion("person", "city", "Râmnicu Vâlcea"),
          addressEvidence: { section: "birthplace", label: "Loc naștere" },
        },
        {
          ...suggestion(
            "person",
            "addressLine1",
            "Jud.CJ Com.Florești Str.Exemplu Nr.12 Bl.A Ap.4",
          ),
          addressEvidence: {
            section: "domicile",
            label: "Domiciliu / Adresse / Address",
          },
        },
        suggestion("person", "firstName", "ANA"),
        suggestion("document", "number", "123456"),
      ],
    });

    const result = await service.analyze({
      ...input,
      nationalIdFormat: "classic",
    });
    expect(result.suggestions).toEqual([
      suggestion("person", "addressLine1", "Str. Exemplu, Nr. 12"),
      suggestion("person", "addressLine2", "Bl. A, Ap. 4"),
      suggestion("person", "region", "Cluj"),
      suggestion("person", "city", "Florești"),
      suggestion("person", "firstName", "Ana"),
      suggestion("document", "number", "123456"),
    ]);
    expect(result.warnings).toEqual(["invalidValue"]);
  });

  it.each([
    null,
    { section: "birthplace", label: "Loc naștere" },
    { section: "domicile", label: "Locul nașterii" },
    { section: "domicile", label: "Lieu de naissance" },
    { section: "domicile", label: "Place of birth" },
    { section: "issuer", label: "Emitent" },
    { section: "domicile", label: "Issuing authority address" },
    { section: "unknown", label: "Domiciliu" },
    { section: "domicile", label: "" },
  ])(
    "omits all address fields without residential evidence (%j), while preserving identity",
    async (addressEvidence) => {
      const fields = {
        countryCode: "RO",
        region: "VL",
        city: "Râmnicu Vâlcea",
        addressLine1: "Str. Exemplu Nr.12",
        addressLine2: "Ap. 4",
      };
      const { service } = setup({
        suggestions: [
          ...Object.entries(fields).map(([field, value]) => ({
            ...suggestion("person", field, value),
            addressEvidence,
          })),
          suggestion("person", "lastName", "POPESCU"),
        ],
      });
      const result = await service.analyze(input);
      expect(result.suggestions).toEqual([
        suggestion("person", "lastName", "Popescu"),
      ]);
      expect(result.warnings).toEqual(["invalidValue"]);
    },
  );

  it("does not extract an address from electronic IDs but accepts the separate residence proof", async () => {
    const suggestions = [
      {
        ...suggestion(
          "person",
          "addressLine1",
          "Jud.CJ Com.Florești Str.Exemplu Nr.12",
        ),
        addressEvidence: { section: "residence", label: "Reședință" },
      },
    ];
    const { service } = setup({ suggestions });
    expect(
      await service.analyze({ ...input, nationalIdFormat: "electronic" }),
    ).toMatchObject({
      suggestions: [],
      warnings: ["invalidValue", "noData"],
    });

    const proof = setup({
      detectedDocumentType: "proofOfAddress",
      suggestions,
    });
    expect(
      (
        await proof.service.analyze({
          ...input,
          documentType: "proofOfAddress",
        })
      ).suggestions,
    ).toEqual([
      suggestion("person", "addressLine1", "Str. Exemplu, Nr. 12"),
      suggestion("person", "region", "Cluj"),
      suggestion("person", "city", "Florești"),
    ]);
  });

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
      ["cnp", "1900228123450"],
      ["number", "001234"],
      ["series", "AB"],
      ["issuingCountryCode", "RO"],
      ["dateOfBirth", "1990-02-28"],
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
      suggestion("person", "addressLine1", "Str. Exemplu, Nr. 12", "back"),
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
      suggestions: [
        suggestion("person", "region", "IS"),
        suggestion("person", "city", "IAȘI"),
      ],
    });
    const result = await service.analyze(input);
    expect(result.suggestions).toContainEqual(
      suggestion("person", "city", "Iași"),
    );
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
    ).toBe("Florești");
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

  it("selects the printed commune and separates street and premises from administrative labels", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("person", "region", "CJ"),
        suggestion("person", "city", "Luna de Sus"),
        suggestion(
          "person",
          "addressLine1",
          "Jud.CJ Com.Florești Sat.Luna de Sus Str.Principală Nr.10 Bl.A Ap.4",
        ),
      ],
    });
    const result = await service.analyze(input);
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        suggestion("person", "region", "Cluj"),
        suggestion("person", "city", "Florești"),
        suggestion("person", "addressLine1", "Str. Principală, Nr. 10"),
        suggestion("person", "addressLine2", "Sat. Luna de Sus, Bl. A, Ap. 4"),
      ]),
    );
    expect(
      result.suggestions.filter((item) => item.field === "city"),
    ).toHaveLength(1);
    expect(
      result.suggestions
        .filter((item) => item.field.startsWith("addressLine"))
        .every((item) => !item.value.includes("Jud.")),
    ).toBe(true);
  });

  it("matches separate unaccented locality suggestions within their county", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("person", "city", "RAMNICU VALCEA"),
        suggestion("person", "region", "VL"),
      ],
    });
    const result = await service.analyze(input);
    expect(result.suggestions).toContainEqual(
      suggestion("person", "city", "Râmnicu Vâlcea"),
    );
  });

  it("leaves unknown localities for review instead of guessing from another county", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("person", "region", "CJ"),
        suggestion("person", "city", "Râmnicu Vâlcea"),
      ],
    });
    const result = await service.analyze(input);
    expect(result.suggestions).toContainEqual({
      ...suggestion("person", "city", "Râmnicu Vâlcea"),
      needsReview: true,
    });
  });

  it("keeps good fields while omitting invalid CNP, date and unknown country", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("person", "firstName", "Ana"),
        suggestion("document", "cnp", "1234567890123"),
        suggestion("document", "expiresOn", "2027-02-30"),
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

  it.each([undefined, "1990-03-01", "1990-02-28"])(
    "derives birth date from validated CNP regardless of OCR date %s",
    async (ocrDate) => {
      const { service } = setup({
        suggestions: [
          suggestion("document", "cnp", "1900228123450"),
          ...(ocrDate ? [suggestion("person", "dateOfBirth", ocrDate)] : []),
        ],
      });
      const result = await service.analyze(input);
      expect(result.suggestions).toEqual([
        suggestion("person", "cnp", "1900228123450"),
        suggestion("person", "dateOfBirth", "1990-02-28"),
      ]);
      expect(result.warnings).toEqual([]);
    },
  );

  it("preserves the CNP source and review flag on its derived birth date", async () => {
    const { service } = setup({
      suggestions: [
        {
          ...suggestion("person", "cnp", "1900228123450", "back"),
          needsReview: true,
        },
      ],
    });
    const result = await service.analyze(input);
    expect(result.suggestions).toContainEqual({
      ...suggestion("person", "dateOfBirth", "1990-02-28", "back"),
      needsReview: true,
    });
  });

  it("keeps the printed birth date when no valid CNP is available", async () => {
    const { service } = setup({
      suggestions: [
        suggestion("person", "cnp", "1234567890123"),
        suggestion("person", "dateOfBirth", "1990-02-28"),
      ],
    });
    const result = await service.analyze(input);
    expect(result.suggestions).toEqual([
      suggestion("person", "dateOfBirth", "1990-02-28"),
    ]);
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

  it.each([
    ["passport", []],
    ["passport", ["typeMismatch"]],
    [null, []],
    [null, ["typeMismatch"]],
  ])(
    "returns no suggestions when actual type is %s and model warnings are %j",
    async (detectedDocumentType, warnings) => {
      const { service } = setup({
        detectedDocumentType,
        suggestions: [suggestion("person", "firstName", "Ana")],
        warnings,
      });
      const result = await service.analyze(input);
      expect(result).toMatchObject({
        suggestions: [],
        licenseCategories: [],
      });
      expect(result.warnings).toContain(
        detectedDocumentType ? "typeMismatch" : "noData",
      );
    },
  );

  it.each(["classic", "electronic"] as const)(
    "applies valid %s national ID readings despite a contradictory typeMismatch warning",
    async (nationalIdFormat) => {
      const { service } = setup({
        suggestions: [
          suggestion("person", "lastName", "EXEMPLU"),
          suggestion("person", "firstName", "ANA-MARIA"),
          suggestion("document", "number", "123456"),
        ],
        warnings: ["typeMismatch"],
      });

      expect(
        await service.analyze({
          ...input,
          nationalIdFormat,
          sources: [input.sources[0]],
        }),
      ).toMatchObject({
        detectedDocumentType: "nationalId",
        suggestions: [
          suggestion("person", "lastName", "Exemplu"),
          suggestion("person", "firstName", "Ana-Maria"),
          suggestion("document", "number", "123456"),
        ],
        warnings: [],
      });
    },
  );

  it("preserves other warnings, review flags and field validation when removing a contradictory typeMismatch", async () => {
    const { service } = setup({
      suggestions: [
        {
          ...suggestion("person", "firstName", "ANA"),
          needsReview: true,
        },
        suggestion("person", "cnp", "invalid"),
      ],
      warnings: ["typeMismatch", "unclearText"],
    });

    expect(await service.analyze(input)).toMatchObject({
      suggestions: [
        { ...suggestion("person", "firstName", "Ana"), needsReview: true },
      ],
      warnings: ["unclearText", "invalidValue"],
    });
  });

  it("preserves reviewed licence categories when the detected type matches despite a typeMismatch warning", async () => {
    const licenceCategory = category("B", "2010-02-01", "2030-02-01");
    const { service } = setup({
      detectedDocumentType: "driverLicense",
      licenseCategories: [licenceCategory],
      warnings: ["typeMismatch"],
    });

    expect(
      await service.analyze({ ...input, documentType: "driverLicense" }),
    ).toMatchObject({
      licenseCategories: [{ ...licenceCategory, needsReview: true }],
      warnings: [],
    });
  });

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
      suggestions: [
        {
          ...suggestion("person", "firstName", "Ana", "other"),
          addressEvidence: null,
        },
      ],
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
        category("A1", null, "2030-02-01"),
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

  it.each([
    "nationalId",
    "passport",
    "visa",
    "residencePermit",
    "driverLicense",
    "proofOfAddress",
  ] as const)("accepts PDF sources for %s", async (documentType) => {
    const { service, provider } = setup({ detectedDocumentType: documentType });
    await service.analyze({
      ...input,
      documentType,
      sources: [{ ...input.sources[0], contentType: "application/pdf" }],
    });
    expect(provider.analyze).toHaveBeenCalled();
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
        sources: [{ ...input.sources[0], contentType: "image/gif" }],
      }),
    ).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_UNSUPPORTED_DOCUMENT",
    });
    expect(provider.analyze).not.toHaveBeenCalled();
  });
});
