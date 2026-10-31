import { toScooter, toScooterListItem } from "./scooters.mapper";

describe("scooter picker summaries", () => {
  it.each([true, false, null])(
    "returns phone equipment without coercing %s",
    (value) => {
      const record = {
        id: "scooter",
        brand: { name: "Honda", code: "HON" },
        createdAt: new Date(),
        updatedAt: new Date(),
        hasPhoneStand: value,
        hasChargingOutlet: value,
      };
      expect(
        toScooter(record as unknown as Parameters<typeof toScooter>[0]),
      ).toMatchObject({ hasPhoneStand: value, hasChargingOutlet: value });
    },
  );

  const base = {
    id: "scooter",
    brand: { name: "KYMCO", code: "KYM" },
    createdAt: new Date("2026-10-14"),
    updatedAt: new Date("2026-10-14"),
  };
  const clientDocuments = ["civ", "registration_certificate", "insurance"].map(
    (type) => ({
      id: type,
      type,
      extractedData: null,
      clientCopyAsset: { deletedAt: null },
      ...(type === "insurance"
        ? {
            insurancePolicy: {
              validFrom: new Date("2020-01-01"),
              validUntil: new Date("2099-01-01"),
            },
          }
        : {}),
    }),
  );
  it("does not require renewal documents for manually confirmed initial CIV validity", () => {
    const row = {
      ...base,
      civDocument: { version: "v2024", issuedAt: new Date("2026-08-21") },
      documents: clientDocuments,
      inspections: [
        {
          source: "manual",
          result: "passed",
          inspectionDate: null,
          validUntil: new Date("2028-08-21"),
          effectiveDate: new Date("2026-10-30"),
          createdAt: new Date("2026-10-30"),
          cardDocumentId: null,
          certificateDocumentId: null,
        },
      ],
    } as unknown as Parameters<typeof toScooter>[0];
    expect(toScooter(row)).toMatchObject({ missingClientDocuments: [] });
    row.inspections![0].inspectionDate = new Date("2026-08-21");
    expect(toScooter(row).missingClientDocuments).toEqual([
      "itp_certificate",
      "itp_card",
    ]);
  });
  it("keeps CIV metadata on inventory summaries and raw fields on details", () => {
    const rawFields = { "13": "ENG-123", unmapped: "Original text" };
    const row = {
      ...base,
      civDocument: {
        version: "v2024",
        issuedAt: new Date("2026-10-14"),
        issuingAuthority: "RAR",
        rawFields,
      },
      inspections: [],
    } as unknown as Parameters<typeof toScooter>[0];
    const detail = toScooter(row);
    const summary = toScooterListItem(row);
    expect(detail.civRawFields).toEqual(rawFields);
    expect(summary).not.toHaveProperty("civRawFields");
    expect(summary).toMatchObject({
      brandCode: "KYM",
      civVersion: "2024",
      civIssuedAt: "2026-10-14",
      civIssuingAuthority: "RAR",
    });
    expect(row.civDocument?.rawFields).toEqual(rawFields);
  });

  it("keeps difficulty totals, cover and maintenance hold independent", () => {
    const result = toScooter({
      ...base,
      photos: [{ id: "cover" }],
      _count: { problems: 2 },
      problems: [
        { difficulty: "hard" },
        { difficulty: "hard" },
        { difficulty: "easy" },
        { difficulty: null },
      ],
    } as unknown as Parameters<typeof toScooter>[0]);
    expect(result.problemDifficultyCounts).toEqual({
      easy: 1,
      medium: 0,
      hard: 2,
      unknown: 1,
    });
    expect(result.maintenanceHoldCount).toBe(2);
    expect(result.coverUrl).toContain("cover");
  });
  it.each([
    [[], false],
    [[{ type: "civ", extractedData: null }], true],
    [[{ type: "registration_certificate", extractedData: null }], false],
    [
      [
        {
          type: "registration_certificate",
          extractedData: { documents: [{ documentType: "civ" }] },
        },
      ],
      true,
    ],
  ])(
    "derives CIV presence from attached documents %j",
    (documents, expected) => {
      expect(
        toScooter({
          ...base,
          civAvailability: "issued",
          documents,
        } as unknown as Parameters<typeof toScooter>[0]).hasCivDocument,
      ).toBe(expected);
    },
  );

  it("distinguishes an empty summary from one that was not loaded", () => {
    expect(
      toScooter({ ...base, problems: [] } as unknown as Parameters<
        typeof toScooter
      >[0]).problemDifficultyCounts,
    ).toEqual({ easy: 0, medium: 0, hard: 0, unknown: 0 });
    expect(
      toScooter(base as unknown as Parameters<typeof toScooter>[0])
        .problemDifficultyCounts,
    ).toBeUndefined();
  });
});
