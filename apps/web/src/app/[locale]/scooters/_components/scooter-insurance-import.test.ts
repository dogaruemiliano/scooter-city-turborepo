import { describe, expect, it } from "vitest";
import {
  parseDocumentImport,
  documentExtractionPrompt,
} from "./scooter-document-import";
import {
  insuranceEditorDefaults,
  scooterEditorDefaults,
} from "./scooter-editor-schema";
import type { DocumentSource } from "./scooter-document-sources";
import { parseInsuranceImport } from "./scooter-insurance-import";
import { insuranceFieldReviews } from "./scooter-import-review";

const vin = "LXYTCKP05P0000001";
const current = { ...scooterEditorDefaults(), vin };
const insurance = {
  insuredName: "Example SRL",
  validFrom: "2026-01-01",
  validUntil: "2026-12-31",
  premiumAmount: "250,50",
  currency: "RON",
  documentVin: vin,
  sourceFileNames: ["insurance.pdf"],
};
const documentVins = [
  { fileName: "civ.pdf", documentType: "civ", vin },
  { fileName: "insurance.pdf", documentType: "insurance", vin },
];
const insuranceSource: DocumentSource = {
  sourceId: "uploaded-insurance",
  type: "insurance",
  fileName: "insurance.pdf",
};
const parse = (data: unknown, editing = false) =>
  parseDocumentImport(JSON.stringify(data), [], current, editing, {}, [
    { fileName: "insurance.pdf" },
    { fileName: "second.pdf" },
  ]);
describe("insurance extraction", () => {
  it("imports technical, registration and insurance data together with an unreadable raw CIV rubric", () => {
    expect(
      parse({
        vin,
        powertrainType: "combustion",
        powerKw: 2.68,
        standingCapacity: 0,
        actualWeightKg: "-",
        registrationType: "local",
        registrationNumber: "14947",
        civRawFields: { "15": null, Mențiuni: "", "P.2": "2.68", "7": "-" },
        documentVins: [
          ...documentVins,
          {
            fileName: "registration.pdf",
            documentType: "registration_certificate",
            vin,
          },
        ],
        insurancePolicies: [insurance],
      }),
    ).toMatchObject({
      ok: true,
      values: {
        vin,
        powerKw: "2.68",
        standingCapacity: "0",
        registrationNumber: "14947",
      },
      rawFields: { "P.2": "2.68", "7": "-" },
      unresolvedRawFields: ["15"],
      insurancePolicies: [
        { insuredName: insurance.insuredName, premiumAmount: "250.5" },
      ],
    });
  });
  it("imports a separate policy, comma price and source evidence", () => {
    const result = parse({ documentVins, insurancePolicies: [insurance] });
    expect(result).toMatchObject({
      ok: true,
      insurancePolicies: [
        {
          insuredName: "Example SRL",
          premiumAmount: "250.5",
          currency: "RON",
          rawFields: { premiumAmount: "250,50" },
        },
      ],
    });
  });
  it("blocks all fields when any document or policy has another VIN", () => {
    for (const data of [
      {
        color: "Blue",
        documentVins: [
          documentVins[0],
          { ...documentVins[1], vin: "LXYTCKP05P0000002" },
        ],
      },
      {
        documentVins,
        insurancePolicies: [{ ...insurance, documentVin: "LXYTCKP05P0000002" }],
      },
    ])
      expect(parse(data)).toMatchObject({ ok: false, reason: "vinMismatch" });
  });
  it("requires review for unknown VIN and preserves dash versus unreadable price", () => {
    expect(
      parse({
        documentVins: [{ ...documentVins[1], vin: null }],
        insurancePolicies: [
          {
            ...insurance,
            documentVin: null,
            premiumAmount: "-",
            currency: null,
          },
        ],
      }),
    ).toMatchObject({
      ok: true,
      needsVinReview: true,
      insurancePolicies: [
        {
          documentVin: "",
          premiumAmount: "",
          rawFields: { premiumAmount: "-", currency: null },
        },
      ],
    });
    expect(parse({ insurancePolicies: [insurance] })).toMatchObject({
      ok: false,
      fields: expect.arrayContaining(["documentVins"]),
    });
  });
  it("attaches extracted fields to the policy whose document was uploaded and does not duplicate it", () => {
    const draft = { ...insuranceEditorDefaults(), id: "draft-policy" };
    const first = parseDocumentImport(
      JSON.stringify({ documentVins, insurancePolicies: [insurance] }),
      [],
      { ...current, insurancePolicies: [draft] },
      false,
      {},
      [{ fileName: "insurance.pdf", insurancePolicyId: draft.id }],
    );
    expect(first).toMatchObject({
      ok: true,
      insurancePolicies: [{ id: draft.id, insuredName: "Example SRL" }],
    });
    if (!first.ok) throw new Error("Expected import");
    const second = parseDocumentImport(
      JSON.stringify({ documentVins, insurancePolicies: [insurance] }),
      [],
      { ...current, insurancePolicies: first.insurancePolicies },
      false,
      {},
      [{ fileName: "insurance.pdf" }],
    );
    expect(second.ok && second.insurancePolicies).toHaveLength(1);
  });

  it("combines readings only for attachments explicitly belonging to the same policy", () => {
    const result = parseInsuranceImport(
      {
        documentVins: [
          documentVins[1],
          { ...documentVins[1], fileName: "second.pdf" },
        ],
        insurancePolicies: [
          { ...insurance, validUntil: null },
          {
            ...insurance,
            insuredName: null,
            premiumAmount: 250.5,
            sourceFileNames: ["second.pdf"],
          },
        ],
      },
      vin,
      [],
      [
        { fileName: "insurance.pdf", insurancePolicyId: "policy-1" },
        { fileName: "second.pdf", insurancePolicyId: "policy-1" },
      ],
    );
    expect(result.errors).toEqual([]);
    expect(result.policies).toHaveLength(1);
    expect(result.policies?.[0]).toMatchObject({
      id: "policy-1",
      insuredName: "Example SRL",
      validUntil: "2026-12-31",
      premiumAmount: "250.5",
      sourceFileNames: ["insurance.pdf", "second.pdf"],
    });
  });

  it("keeps conflicts unresolved across all attachments and exposes a warning", () => {
    const result = parseInsuranceImport(
      {
        documentVins: ["insurance.pdf", "second.pdf", "third.pdf"].map(
          (fileName) => ({
            fileName,
            documentType: "insurance",
            vin,
          }),
        ),
        insurancePolicies: [250, 300, 250].map((premiumAmount, index) => ({
          ...insurance,
          premiumAmount,
          sourceFileNames: [
            ["insurance.pdf", "second.pdf", "third.pdf"][index],
          ],
        })),
      },
      vin,
      [],
      ["insurance.pdf", "second.pdf", "third.pdf"].map((fileName) => ({
        fileName,
        insurancePolicyId: "policy-1",
      })),
    );
    expect(result.errors).toEqual([]);
    expect(result.policies).toHaveLength(1);
    expect(result.policies?.[0]).toMatchObject({
      premiumAmount: "",
      rawFields: { premiumAmount: null },
    });
    expect(insuranceFieldReviews(result.policies ?? [])).toContainEqual({
      field: "premiumAmount",
      policyId: "policy-1",
      value: "",
      rawCodes: [],
    });
  });

  it("does not erase manually entered values when document readings conflict", () => {
    const result = parseInsuranceImport(
      {
        documentVins: [
          documentVins[1],
          { ...documentVins[1], fileName: "second.pdf" },
        ],
        insurancePolicies: [
          insurance,
          { ...insurance, premiumAmount: 300, sourceFileNames: ["second.pdf"] },
        ],
      },
      vin,
      [{ ...insuranceEditorDefaults(), id: "policy-1", premiumAmount: "123" }],
      [
        { fileName: "insurance.pdf", insurancePolicyId: "policy-1" },
        { fileName: "second.pdf", insurancePolicyId: "policy-1" },
      ],
    );
    expect(result.errors).toEqual([]);
    expect(result.policies?.[0]).toMatchObject({
      premiumAmount: "123",
      rawFields: { premiumAmount: null },
    });
    expect(insuranceFieldReviews(result.policies ?? [])).toContainEqual({
      field: "premiumAmount",
      policyId: "policy-1",
      value: "123",
      rawCodes: [],
    });
  });

  it("treats a printed dash and a readable value as conflicting evidence", () => {
    const result = parseInsuranceImport(
      {
        documentVins: [
          documentVins[1],
          { ...documentVins[1], fileName: "second.pdf" },
        ],
        insurancePolicies: [
          { ...insurance, premiumAmount: "-" },
          { ...insurance, sourceFileNames: ["second.pdf"] },
        ],
      },
      vin,
      [],
      [
        { fileName: "insurance.pdf", insurancePolicyId: "policy-1" },
        { fileName: "second.pdf", insurancePolicyId: "policy-1" },
      ],
    );
    expect(result.errors).toEqual([]);
    expect(result.policies?.[0]).toMatchObject({
      premiumAmount: "",
      rawFields: { premiumAmount: null },
    });
  });

  it("keeps separate saved policies and unassigned documents separate", () => {
    const data = {
      documentVins: [
        documentVins[1],
        { ...documentVins[1], fileName: "second.pdf" },
      ],
      insurancePolicies: [
        insurance,
        { ...insurance, sourceFileNames: ["second.pdf"] },
      ],
    };
    for (const files of [
      [
        { fileName: "insurance.pdf", insurancePolicyId: "policy-1" },
        { fileName: "second.pdf", insurancePolicyId: "policy-2" },
      ],
      [{ fileName: "insurance.pdf" }, { fileName: "second.pdf" }],
    ]) {
      const result = parseInsuranceImport(data, vin, [], files);
      expect(result.errors).toEqual([]);
      expect(result.policies).toHaveLength(2);
    }
  });

  it("rejects a combined date period that is invalid across separate pages", () => {
    const result = parseInsuranceImport(
      {
        documentVins: [
          documentVins[1],
          { ...documentVins[1], fileName: "second.pdf" },
        ],
        insurancePolicies: [
          { ...insurance, validUntil: null },
          {
            ...insurance,
            validFrom: null,
            validUntil: "2025-12-31",
            sourceFileNames: ["second.pdf"],
          },
        ],
      },
      vin,
      [],
      [
        { fileName: "insurance.pdf", insurancePolicyId: "policy-1" },
        { fileName: "second.pdf", insurancePolicyId: "policy-1" },
      ],
    );
    expect(result.errors).toContain("insurancePolicies.validUntil");
  });
  it("keeps expired and future policies separately and rejects inverted dates", () => {
    const older = {
      ...insurance,
      validFrom: "2025-01-01",
      validUntil: "2025-12-31",
      sourceFileNames: ["old.pdf"],
    };
    expect(
      parse(
        {
          documentVins: [
            ...documentVins,
            { ...documentVins[1], fileName: "old.pdf" },
          ],
          insurancePolicies: [older, insurance],
        },
        true,
      ),
    ).toMatchObject({
      ok: true,
      insurancePolicies: [
        { validUntil: "2025-12-31" },
        { validUntil: "2026-12-31" },
      ],
    });
    expect(
      parse({
        documentVins,
        insurancePolicies: [{ ...insurance, validUntil: "2025-01-01" }],
      }),
    ).toMatchObject({ ok: false, reason: "invalidFields" });
  });
  it("rejects multiple policies atomically in the create form", () => {
    const second = { ...insurance, sourceFileNames: ["second.pdf"] };
    expect(
      parse({
        color: "Red",
        documentVins: [
          ...documentVins,
          { ...documentVins[1], fileName: "second.pdf" },
        ],
        insurancePolicies: [insurance, second],
      }),
    ).toEqual({ ok: false, reason: "singleInsurance", fields: [] });
    expect(
      documentExtractionPrompt(false, (field) => field, [insuranceSource]),
    ).toContain("maximum o poliță");
    expect(
      documentExtractionPrompt(true, (field) => field, [insuranceSource]),
    ).toContain("păstrează polițele separate");
  });
  it("requests the insured party, total premium and independent VIN in the downloadable file", () => {
    const prompt = documentExtractionPrompt(false, (field) => field, [
      insuranceSource,
    ]);
    for (const field of [
      "insuredName",
      "validFrom",
      "validUntil",
      "premiumAmount",
      "currency",
      "documentVin",
    ]) {
      expect(prompt).toContain(`"${field}": null`);
      expect(prompt).toContain(`\n${field}: `);
    }
    expect(prompt).toContain("ASIGURAT");
    expect(prompt).toContain("nu asigurătorul sau plătitorul");
    expect(prompt).toContain("prima TOTALĂ, nu rata");
    expect(prompt).toContain("nu calcula totalul");
    expect(prompt).toContain("nu presupune moneda");
    expect(prompt).toContain(
      "Nu lua numele asiguratului sau VIN-ul din alt document",
    );
    expect(prompt).toContain("rawFields folosește aceleași șase chei");
    expect(prompt).toContain("fișierul descărcabil scuter.json, UTF-8");
    expect(prompt).not.toContain("\npowerKw: ");
    expect(prompt).not.toContain("\nregistrationNumber: ");
    expect(prompt).not.toContain("\ncivNumber: ");
  });
});
