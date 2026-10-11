import { describe, expect, it } from "vitest";
import { parseDocumentImport } from "./scooter-document-import";
import type { DocumentSource } from "./scooter-document-sources";
import {
  insuranceEditorDefaults,
  scooterEditorDefaults,
} from "./scooter-editor-schema";

const vin = "L5YAUCZB9H1148984";
const sources: DocumentSource[] = [
  { sourceId: "civ-1", type: "civ", fileName: "CIV-004-AGM.pdf" },
  {
    sourceId: "registration-1",
    type: "registration_certificate",
    fileName: "cert-inreg-004-AGM.pdf",
  },
  {
    sourceId: "insurance-1",
    type: "insurance",
    fileName: "asigurare-004-AGM.pdf",
    insurancePolicyId: "policy-1",
  },
];

function fixture() {
  return {
    brandName: "AGM",
    civNumber: "T943622",
    civVersion: "2024",
    civIssuedAt: "2026-08-20",
    civIssuingAuthority: "Vâlcea",
    vin,
    vehicleType: "ZN50QT-30A",
    variant: "ZN25",
    version: "ZNAUA",
    commercialName: "VX 50",
    manufactureYear: 2017,
    color: "Negru",
    vehicleClass: "-",
    standingCapacity: 0,
    vehicleCategory: "L1e",
    nationalCategory: "motorcycle",
    bodyType: "two_wheel_moped",
    typeApprovalNumber: "e4*2002/24*2691*06",
    nationalRegistryNumber: "L1B9130200E85K1",
    seatsCount: 2,
    powertrainType: "combustion",
    engineCode: "BN139QMB",
    engineDisplacementCc: 50,
    powerKw: 1.8,
    fuelType: "petrol",
    ratedEngineRpm: 7000,
    engineSerialNumber: "H2306261",
    powerToWeightRatioKwKg: 0,
    maxSpeedKmh: 25,
    emissionsStandard: "97/24*2009/108",
    nationalEmissionsCode: "K1",
    fuelTankCapacityLiters: 5.5,
    curbWeightKg: 93,
    actualWeightKg: "-",
    maxTechnicallyPermissibleMassKg: 243,
    maxTrainMassKg: "-",
    maxAxle1MassKg: 100,
    maxAxle2MassKg: 180,
    maxAxle3MassKg: "-",
    maxAxle4MassKg: "-",
    maxAxle5MassKg: "-",
    brakedTrailerMassKg: "-",
    unbrakedTrailerMassKg: "-",
    couplingPointMassKg: "-",
    axlesCount: 2,
    lengthMm: 1820,
    widthMm: 685,
    heightMm: 1135,
    wheelbaseMm: 1290,
    frontTyreSpecification: "3.50-10 51J/MT2.50X10",
    rearTyreSpecification: "3.50-10 51J/MT2.50X10",
    driveType: "SPATE",
    frontSuspension: "Mecanică",
    rearSuspension: "Mecanică",
    stationaryNoiseDb: 76,
    noiseMeasurementRpm: 3750,
    drivingNoiseDb: 65,
    co2EmissionsGKm: "-",
    registrationCertificateNumber: null,
    registrationType: "local",
    registrationNumber: "14949",
    registrationDate: "2026-09-01",
    civRawFields: {
      "D.1": "AGM",
      "D.2": "ZN50QT-30A",
      "D.2 Varianta": "ZN25",
      "D.2 Versiune": "ZNAUA",
      "D.3": "VX 50",
      E: vin,
      "1": "2017",
      J: "L1e",
      "2": "Motociclu",
      "3": "-",
      "4": "L1e moped",
      K: "e4*2002/24*2691*06",
      "5": "L1B9130200E85K1",
      L: "2",
      "F.1": "243",
      "6": "-",
      "N.1": "100",
      "N.2": "180",
      "N.3": "-",
      "N.4": "-",
      "N.5": "-",
      G: "93",
      "7": "-",
      "O.1": "-",
      "O.2": "-",
      "8": "-",
      "9": "1820",
      "10": "685",
      "11": "1135",
      "12": "1290",
      "13": "BN139QMB",
      "P.1": "50",
      "P.2": "1.8",
      "P.3": "BENZINA",
      "P.4": "7000",
      "P.5": "H2306261",
      "14": "Motor cu Ardere Interna",
      "15": null,
      "V.9": "97/24*2009/108",
      "16": "K1",
      R: "Negru",
      "S.1": "2",
      "S.2": "0",
      T: "25",
      "U.1": "76",
      "U.2": "3750",
      "U.3": "65",
      Q: "0",
      "V.7": "-",
      "17": "SPATE",
      "18.1": "3.50-10 51J/MT2.50X10",
      "18.2": "3.50-10 51J/MT2.50X10",
      "19.1": "Mecanică",
      "19.2": "Mecanică",
      W: "5.5",
      "Reprezentanță RAR": "Vâlcea",
      "Data eliberare": "20-08-2026",
      "Serie CIV": "T943622",
    },
    documentVins: sources.map((source) => ({
      fileName: source.fileName,
      documentType: source.type,
      vin: vin as string | null,
    })),
    insurancePolicies: [
      {
        insuredName: "DOGARU EMILIANO CONSTANTIN",
        validFrom: "2026-09-13",
        validUntil: "2027-09-12",
        premiumAmount: 278.88,
        currency: "RON",
        documentVin: vin as string | null,
        sourceFileNames: ["asigurare-004-AGM.pdf"],
        rawFields: {
          insuredName: "DOGARU EMILIANO CONSTANTIN",
          validFrom: "13.09.2026",
          validUntil: "12.09.2027",
          premiumAmount: "278,88 Lei",
          currency: "Lei",
          documentVin: vin,
        },
      },
    ],
  };
}

function parse(input: unknown, manifest = sources) {
  return parseDocumentImport(
    JSON.stringify(input),
    [{ id: "brand-agm", name: "AGM" }],
    {
      ...scooterEditorDefaults(),
      insurancePolicies: [{ ...insuranceEditorDefaults(), id: "policy-1" }],
    },
    false,
    {},
    [],
    manifest,
  );
}

function downloadCopy(fileName: string, suffix: string) {
  return fileName.replace(/\.pdf$/, `${suffix}.pdf`);
}

function latestFixture(suffix = "(1)") {
  const input = fixture();
  return {
    ...input,
    registrationCertificateNumber: "BUJORENI-VL-176/18",
    civRawFields: { ...input.civRawFields, "15": "-" },
    documentVins: input.documentVins.map((entry) => ({
      ...entry,
      fileName: downloadCopy(entry.fileName, suffix),
    })),
    insurancePolicies: input.insurancePolicies.map((policy) => ({
      ...policy,
      sourceFileNames: policy.sourceFileNames.map((fileName) =>
        downloadCopy(fileName, suffix),
      ),
    })),
  };
}

describe("legacy document extraction with explicit filename evidence", () => {
  it("imports the AGM response and assigns technical, registration and insurance fields to their exact documents", () => {
    const result = parse(fixture());
    expect(result).toMatchObject({
      ok: true,
      values: {
        brandId: "brand-agm",
        vin,
        civNumber: "T943622",
        bodyType: "two_wheel_moped",
        typeApprovalNumber: "e4*2002/24*2691*06",
        powerKw: "1.8",
        standingCapacity: "0",
        powerToWeightRatioKwKg: "0",
        maxSpeedKmh: "25",
        requiredLicenseCategory: "none",
        registrationNumber: "14949",
      },
      autoFilledLicenseCategory: true,
      confirmedEmpty: expect.arrayContaining([
        "actualWeightKg",
        "vehicleClass",
      ]),
      unresolved: expect.arrayContaining(["registrationCertificateNumber"]),
      unresolvedRawFields: ["15"],
      unresolvedDocumentFields: { "civ-1": ["15"] },
      rawFields: { K: "e4*2002/24*2691*06", "7": "-", "S.2": "0" },
      fieldSources: {
        brandId: ["civ-1"],
        powerKw: ["civ-1"],
        requiredLicenseCategory: ["civ-1"],
        registrationNumber: ["registration-1"],
        "insurancePolicies.0.premiumAmount": ["insurance-1"],
      },
      extractedDocuments: {
        "civ-1": {
          vin,
          fields: { powerKw: 1.8, standingCapacity: 0, actualWeightKg: "-" },
          rawFields: { "15": null, "7": "-", "S.2": "0" },
        },
        "registration-1": {
          vin,
          fields: {
            registrationNumber: "14949",
            registrationCertificateNumber: null,
          },
          rawFields: {},
        },
        "insurance-1": {
          vin,
          fields: { premiumAmount: 278.88 },
          rawFields: { premiumAmount: "278,88 Lei", currency: "Lei" },
        },
      },
      insurancePolicies: [
        {
          id: "policy-1",
          insuredName: "DOGARU EMILIANO CONSTANTIN",
          validFrom: "2026-09-13",
          validUntil: "2027-09-12",
          premiumAmount: "278.88",
          currency: "RON",
          documentVin: vin,
          sourceFileNames: ["asigurare-004-AGM.pdf"],
          rawFields: { premiumAmount: "278,88 Lei", currency: "Lei" },
        },
      ],
    });
    if (!result.ok) throw new Error("Expected legacy AGM response to import");
    expect(result.insurancePolicies).toHaveLength(1);
    expect(result.extractedDocuments?.["civ-1"]?.fields).not.toHaveProperty(
      "registrationNumber",
    );
    expect(
      result.extractedDocuments?.["registration-1"]?.fields,
    ).not.toHaveProperty("powerKw");
  });

  it.each([
    { jsonSuffix: "(1)", uploadSuffix: "" },
    { jsonSuffix: "", uploadSuffix: "(2)" },
    { jsonSuffix: " (1)", uploadSuffix: "" },
    { jsonSuffix: "", uploadSuffix: " (2)" },
    { jsonSuffix: "(1)", uploadSuffix: " (2)" },
  ])(
    'imports the latest AGM response with JSON suffix "$jsonSuffix" and upload suffix "$uploadSuffix"',
    ({ jsonSuffix, uploadSuffix }) => {
      const manifest = sources.map((source) => ({
        ...source,
        fileName: downloadCopy(source.fileName, uploadSuffix),
      }));
      const result = parse(latestFixture(jsonSuffix), manifest);
      expect(result).toMatchObject({
        ok: true,
        values: {
          brandId: "brand-agm",
          vin,
          powerKw: "1.8",
          registrationCertificateNumber: "BUJORENI-VL-176/18",
          registrationNumber: "14949",
          requiredLicenseCategory: "none",
        },
        unresolvedRawFields: [],
        fieldSources: {
          powerKw: ["civ-1"],
          registrationCertificateNumber: ["registration-1"],
          "insurancePolicies.0.premiumAmount": ["insurance-1"],
        },
        extractedDocuments: {
          "civ-1": {
            vin,
            rawFields: { "15": "-", K: "e4*2002/24*2691*06" },
          },
          "registration-1": {
            vin,
            fields: { registrationCertificateNumber: "BUJORENI-VL-176/18" },
          },
          "insurance-1": {
            vin,
            fields: { premiumAmount: 278.88 },
            rawFields: { premiumAmount: "278,88 Lei", currency: "Lei" },
          },
        },
        insurancePolicies: [
          {
            id: "policy-1",
            premiumAmount: "278.88",
            sourceFileNames: [manifest[2]!.fileName],
            rawFields: { premiumAmount: "278,88 Lei", currency: "Lei" },
          },
        ],
      });
      if (!result.ok) throw new Error("Expected download copies to match");
      expect(result.insurancePolicies).toHaveLength(1);
      expect(Object.keys(result.extractedDocuments ?? {}).sort()).toEqual([
        "civ-1",
        "insurance-1",
        "registration-1",
      ]);
    },
  );

  it("normalizes surrounding whitespace and Unicode filename composition without changing the uploaded name", () => {
    const input = latestFixture();
    const manifest = sources.map((source) => ({
      ...source,
      fileName: source.fileName.replace("AGM", "Vâlcea"),
    }));
    input.documentVins = input.documentVins.map((entry) => ({
      ...entry,
      fileName: ` ${entry.fileName.replace("AGM", "Vâlcea").normalize("NFD")} `,
    }));
    input.insurancePolicies[0]!.sourceFileNames = [
      " asigurare-004-Vâlcea(1).pdf ".normalize("NFD"),
    ];
    expect(parse(input, manifest)).toMatchObject({
      ok: true,
      insurancePolicies: [
        { id: "policy-1", sourceFileNames: ["asigurare-004-Vâlcea.pdf"] },
      ],
    });
  });

  it("matches download-copy evidence and policy references for a single insurance upload", () => {
    const input = latestFixture();
    expect(
      parse(
        {
          documentVins: [input.documentVins[2]],
          insurancePolicies: input.insurancePolicies,
        },
        [sources[2]!],
      ),
    ).toMatchObject({
      ok: true,
      fieldSources: { "insurancePolicies.0.premiumAmount": ["insurance-1"] },
      insurancePolicies: [
        {
          id: "policy-1",
          documentVin: vin,
          sourceFileNames: ["asigurare-004-AGM.pdf"],
          rawFields: { premiumAmount: "278,88 Lei", currency: "Lei" },
        },
      ],
    });
  });

  it.each([
    "CIV-004-OTHER(1).pdf",
    "CIV-004-AGM(1).png",
    "CIV-004-AGM(1)-scan.pdf",
    "CIV-004-AGM(final).pdf",
  ])(
    "does not treat the unrelated filename %s as a download copy",
    (fileName) => {
      const input = latestFixture();
      input.documentVins[0]!.fileName = fileName;
      expect(parse(input)).toMatchObject({
        ok: false,
        reason: "invalidSources",
      });
    },
  );

  it("rejects wrong types and repeated evidence even when download-copy names match", () => {
    const input = latestFixture();
    for (const documentVins of [
      input.documentVins.map((entry, index) =>
        index === 0
          ? { ...entry, documentType: "registration_certificate" }
          : entry,
      ),
      [
        ...input.documentVins,
        { ...input.documentVins[0], fileName: "CIV-004-AGM(2).pdf" },
      ],
      [
        input.documentVins[0],
        { ...input.documentVins[0], fileName: "CIV-004-AGM(2).pdf" },
        input.documentVins[2],
      ],
    ]) {
      expect(parse({ ...input, documentVins })).toMatchObject({
        ok: false,
        reason: "invalidSources",
      });
    }
  });

  it("rejects ambiguous uploaded copies instead of choosing one", () => {
    const input = latestFixture();
    const extra: DocumentSource = {
      sourceId: "civ-copy",
      type: "civ",
      fileName: "CIV-004-AGM(2).pdf",
    };
    expect(
      parse(
        {
          ...input,
          documentVins: [
            ...input.documentVins,
            { fileName: extra.fileName, documentType: extra.type, vin },
          ],
        },
        [...sources, extra],
      ),
    ).toMatchObject({ ok: false, reason: "invalidSources" });
  });

  it.each(["exact", "ambiguous evidence", "wrong policy reference"] as const)(
    "prefers distinct exact filenames over matching download-copy basenames: %s",
    (scenario) => {
      const input = latestFixture("");
      const manifest = sources.map((source) => ({
        ...source,
        fileName:
          source.type === "civ"
            ? "scan(1).pdf"
            : source.type === "insurance"
              ? "scan(2).pdf"
              : source.fileName,
      }));
      input.documentVins = input.documentVins.map((entry, index) => ({
        ...entry,
        fileName: manifest[index]!.fileName,
      }));
      input.insurancePolicies[0]!.sourceFileNames = ["scan(2).pdf"];
      if (scenario === "ambiguous evidence")
        input.documentVins[0]!.fileName = "scan(3).pdf";
      if (scenario === "wrong policy reference")
        input.insurancePolicies[0]!.sourceFileNames = ["scan(1).pdf"];

      expect(parse(input, manifest)).toMatchObject(
        scenario === "exact"
          ? {
              ok: true,
              fieldSources: {
                powerKw: ["civ-1"],
                "insurancePolicies.0.premiumAmount": ["insurance-1"],
              },
              insurancePolicies: [
                { id: "policy-1", sourceFileNames: ["scan(2).pdf"] },
              ],
            }
          : { ok: false, reason: "invalidSources" },
      );
    },
  );

  it("still rejects VIN conflicts when document filenames differ only by download suffix", () => {
    const input = latestFixture();
    input.documentVins[1]!.vin = "L5YAUCZB9H1148985";
    expect(parse(input)).toMatchObject({ ok: false, reason: "vinMismatch" });
  });

  it("matches filenames instead of array order", () => {
    const input = fixture();
    input.documentVins.reverse();
    expect(parse(input, [...sources].reverse())).toMatchObject({
      ok: true,
      fieldSources: {
        powerKw: ["civ-1"],
        registrationNumber: ["registration-1"],
        "insurancePolicies.0.insuredName": ["insurance-1"],
      },
    });
  });

  it("requires complete, unique and correctly typed filename evidence", () => {
    const input = fixture();
    const evidence = input.documentVins;
    for (const documentVins of [
      undefined,
      evidence.slice(1),
      [...evidence, evidence[0]],
      [evidence[0], evidence[0], evidence[2]],
      evidence.map((entry, index) =>
        index ? entry : { ...entry, fileName: "other-CIV.pdf" },
      ),
      evidence.map((entry, index) =>
        index ? entry : { ...entry, documentType: "registration_certificate" },
      ),
      evidence.map((entry, index) =>
        index ? entry : { ...entry, unexpected: "ignored evidence" },
      ),
    ])
      expect(parse({ ...input, documentVins })).toMatchObject({ ok: false });
  });

  it("rejects ambiguous technical provenance, duplicate filenames and repeated document types", () => {
    const input = fixture();
    for (const extra of [
      { sourceId: "import-1", type: "import_document", fileName: "import.pdf" },
      { sourceId: "civ-2", type: "civ", fileName: "CIV-back.pdf" },
      {
        sourceId: "registration-2",
        type: "registration_certificate",
        fileName: "registration-back.pdf",
      },
      {
        sourceId: "insurance-2",
        type: "insurance",
        fileName: "older-insurance.pdf",
        insurancePolicyId: "policy-2",
      },
    ] satisfies DocumentSource[])
      expect(
        parse(
          {
            ...input,
            documentVins: [
              ...input.documentVins,
              { fileName: extra.fileName, documentType: extra.type, vin },
            ],
          },
          [...sources, extra],
        ),
      ).toMatchObject({ ok: false, reason: "invalidSources" });

    const duplicates = sources.map((source) => ({
      ...source,
      fileName: "scan.pdf",
    }));
    expect(
      parse(
        {
          ...input,
          documentVins: input.documentVins.map((entry) => ({
            ...entry,
            fileName: "scan.pdf",
          })),
        },
        duplicates,
      ),
    ).toMatchObject({ ok: false, reason: "invalidSources" });
  });

  it("does not silently discard populated fields whose document is missing", () => {
    for (let missing = 0; missing < sources.length; missing++) {
      const input = fixture();
      input.documentVins.splice(missing, 1);
      expect(
        parse(
          input,
          sources.filter((_, index) => index !== missing),
        ),
      ).toMatchObject({ ok: false });
    }
  });

  it("requires exactly one insurance policy linked to the uploaded insurance filename", () => {
    const input = fixture();
    const policy = input.insurancePolicies[0]!;
    for (const insurancePolicies of [
      [policy, policy],
      [{ ...policy, sourceFileNames: [] }],
      [{ ...policy, sourceFileNames: ["another-insurance.pdf"] }],
      [{ ...policy, sourceFileNames: [sources[0]!.fileName] }],
      [
        {
          ...policy,
          sourceFileNames: [...policy.sourceFileNames, "extra.pdf"],
        },
      ],
      [{ ...policy, unexpected: "unrecognized policy field" }],
    ])
      expect(parse({ ...input, insurancePolicies })).toMatchObject({
        ok: false,
      });
  });

  it("rejects conflicting VIN assertions across documents, root fields and policy", () => {
    const otherVin = "L5YAUCZB9H1148985";
    const input = fixture();
    for (const conflicting of [
      { ...input, vin: otherVin },
      {
        ...input,
        documentVins: input.documentVins.map((entry, index) =>
          index === 1 ? { ...entry, vin: otherVin } : entry,
        ),
      },
      {
        ...input,
        insurancePolicies: [
          { ...input.insurancePolicies[0], documentVin: otherVin },
        ],
      },
    ]) {
      const result = parse(conflicting);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Conflicting VIN must reject the import");
      expect(["invalidSources", "vinMismatch"]).toContain(result.reason);
    }
  });

  it("retains an unreadable registration VIN and requires manual review even with a known vehicle VIN", () => {
    const input = fixture();
    input.documentVins[1]!.vin = null;
    expect(parse(input)).toMatchObject({
      ok: true,
      needsVinReview: true,
      values: { vin },
      extractedDocuments: { "registration-1": { vin: null } },
    });
  });

  it("retains an unreadable insurance VIN without borrowing the CIV VIN", () => {
    const input = fixture();
    input.documentVins[2]!.vin = null;
    input.insurancePolicies[0]!.documentVin = null;
    expect(parse(input)).toMatchObject({
      ok: true,
      needsVinReview: true,
      extractedDocuments: { "insurance-1": { vin: null } },
      insurancePolicies: [{ id: "policy-1", documentVin: "" }],
    });
  });

  it("keeps syntax validation strict instead of stripping Markdown escapes", () => {
    const escaped = JSON.stringify(fixture()).replace(
      "two_wheel_moped",
      String.raw`two\_wheel\_moped`,
    );
    expect(
      parseDocumentImport(
        escaped,
        [],
        scooterEditorDefaults(),
        false,
        {},
        [],
        sources,
      ),
    ).toEqual({ ok: false, reason: "invalidJson", fields: [] });
  });
});
