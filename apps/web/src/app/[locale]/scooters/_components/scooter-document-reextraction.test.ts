import { describe, expect, it } from "vitest";
import { v1 } from "@repo/api-shared";
import {
  scooterEditorDefaults,
  insuranceEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";
import {
  mergeReextractedEvidence,
  reextractionReview,
  selectedReextraction,
} from "./scooter-document-reextraction";

const vin = "LXYTCKP05P0000001";
function values(overrides: Partial<ScooterEditorValues> = {}) {
  return {
    ...scooterEditorDefaults(),
    vin,
    brandId: "brand",
    powertrainType: "combustion",
    ...overrides,
  };
}
function file(
  extractedData?: v1.scooters.ScooterDocumentExtractedData,
): v1.scooters.ScooterDocument {
  return {
    id: "civ",
    type: "civ",
    fileName: "CIV.pdf",
    contentType: "application/pdf",
    byteSize: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    contentUrl: "/file",
    extractedData,
  };
}
function analysis(
  fields: Record<string, string | number | null>,
  rawFields: Record<string, string | null> = {},
): v1.scooters.ScooterDocumentAnalysis {
  return {
    sourceId: "civ",
    documentType: "civ",
    extractedData: { vin, fields, rawFields },
    issues: [],
    reviewRequired: true,
  };
}
function review(
  readings: v1.scooters.ScooterDocumentAnalysis[],
  current = values(),
  files = [file()],
  baseline = current,
  raw = {},
) {
  return reextractionReview(
    readings,
    files,
    [],
    current,
    baseline,
    raw,
    () => false,
  );
}

describe("saved document reextraction review", () => {
  it.each<Record<string, string>>([
    { model: "AI model" },
    { commercialName: "AI model" },
    { model: "AI model", commercialName: "AI model" },
  ])(
    "reviews and applies the model and commercial name as one choice: %j",
    (fields) => {
      const current = values({
        model: "Manual model",
        commercialName: "Manual model",
      });
      const result = review([analysis(fields)], current);
      const proposals = result.proposals.filter(
        (item) => item.kind === "field",
      );
      expect(proposals).toHaveLength(1);
      const proposal = proposals[0]!;
      expect(proposal).toMatchObject({ field: "model", preselected: false });
      expect(
        selectedReextraction(proposals, {}, {}, {}, [file()], current).values,
      ).toEqual({});
      const applied = selectedReextraction(
        proposals,
        { [proposal.id]: proposal },
        {},
        {},
        [file()],
        current,
      );
      expect(applied.values).toEqual({
        model: "AI model",
        commercialName: "AI model",
      });
    },
  );

  it("preselects missing CIV metadata and leaves existing values unchecked", () => {
    const current = values({ model: "Manual model" });
    const result = review(
      [analysis({ model: "AI model", civIssuedAt: "2025-01-15" })],
      current,
    );
    expect(
      result.proposals.find((item) => item.field === "civIssuedAt"),
    ).toMatchObject({ previous: "", next: "2025-01-15", preselected: true });
    expect(
      result.proposals.find((item) => item.field === "model"),
    ).toMatchObject({
      previous: "Manual model",
      next: "AI model",
      preselected: false,
    });
    expect(current.model).toBe("Manual model");
  });
  it("never proposes deleting values for nulls, printed dashes, or absent fields", () => {
    const result = review(
      [analysis({ model: null, color: "-" })],
      values({ model: "Manual", color: "Blue" }),
    );
    expect(result.proposals.filter((item) => item.kind === "field")).toEqual(
      [],
    );
  });
  it("does not preselect a field cleared or edited while analysis ran", () => {
    const baseline = values({ model: "Manual" });
    const result = review(
      [analysis({ model: "AI" })],
      values({ model: "" }),
      [file()],
      baseline,
    );
    expect(
      result.proposals.find((item) => item.field === "model")?.preselected,
    ).toBe(false);
    const dirty = reextractionReview(
      [analysis({ model: "AI" })],
      [file()],
      [],
      values(),
      values(),
      {},
      () => true,
    );
    expect(
      dirty.proposals.find((item) => item.field === "model")?.preselected,
    ).toBe(false);
  });
  it("preserves zero-valued evidence and original CIV rubric text", () => {
    const previous = {
      vin,
      fields: { standingCapacity: 0 },
      rawFields: { capacity: "0", untouched: "-" },
    };
    const next = mergeReextractedEvidence(previous, {
      vin: null,
      fields: { standingCapacity: null },
      rawFields: { capacity: null, new: "0" },
    });
    expect(next.fields.standingCapacity).toBe(0);
    expect(next.rawFields).toEqual({ capacity: "0", untouched: "-", new: "0" });
  });
  it("excludes mismatched documents while retaining valid suggestions from others", () => {
    const mismatch = {
      ...analysis({ model: "Wrong" }),
      sourceId: "wrong",
      extractedData: {
        ...analysis({}).extractedData,
        vin: "LXYTCKP05P0000002",
      },
    };
    const result = review(
      [mismatch, analysis({ civIssuedAt: "2025-01-15" })],
      values(),
      [file(), { ...file(), id: "wrong" }],
    );
    expect(result.rejected).toEqual(["wrong"]);
    expect(result.proposals.some((item) => item.field === "civIssuedAt")).toBe(
      true,
    );
    expect(result.proposals.some((item) => item.field === "model")).toBe(false);
  });
  it("does not pick a value when two CIVs disagree", () => {
    const result = review(
      [
        analysis({ civIssuedAt: "2025-01-15" }),
        { ...analysis({ civIssuedAt: "2025-02-15" }), sourceId: "second" },
      ],
      values(),
      [file(), { ...file(), id: "second" }],
    );
    expect(result.proposals.some((item) => item.field === "civIssuedAt")).toBe(
      false,
    );
  });
  it("keeps all policies and only applies explicitly selected fields of an associated policy", () => {
    const policy = insuranceEditorDefaults({
      id: "policy",
      insuredName: "Manual company",
      validFrom: "2026-01-01",
      validUntil: "2026-12-31",
      premiumAmount: 200,
      currency: "RON",
      documentVin: vin,
      vinReviewConfirmed: true,
    });
    const historical = {
      ...policy,
      id: "historical",
      insuredName: "Historical",
    };
    const current = values({ insurancePolicies: [historical, policy] });
    const reading = {
      ...analysis({
        insuredName: "Extracted company",
        validFrom: "2026-01-01",
        validUntil: "2026-12-31",
        premiumAmount: 250,
        currency: "RON",
        documentVin: vin,
      }),
      documentType: "insurance" as const,
    };
    const files = [
      { ...file(), type: "insurance" as const, insurancePolicyId: "policy" },
    ];
    const result = review([reading], current, files);
    const proposal = result.proposals.find(
      (item) => item.kind === "policy" && item.field === "insuredName",
    )!;
    expect(proposal).toMatchObject({
      preselected: false,
      previous: "Manual company",
      next: "Extracted company",
    });
    const applied = selectedReextraction(
      result.proposals,
      { [proposal.id]: proposal },
      {},
      result.evidence ?? {},
      files,
      current,
    );
    expect(applied.insurancePolicies?.[0]).toEqual(historical);
    expect(applied.insurancePolicies?.[1]).toMatchObject({
      insuredName: "Extracted company",
      premiumAmount: policy.premiumAmount,
      vinReviewConfirmed: true,
    });
  });
  it("applies only selected values and rejects stale selections", () => {
    const current = values({ model: "Old" });
    const initial = review(
      [analysis({ model: "New", civIssuedAt: "2025-01-15" })],
      current,
    );
    const selections = Object.fromEntries(
      initial.proposals
        .filter((item) => item.kind === "field")
        .map((item) => [item.id, { previous: item.previous, next: item.next }]),
    );
    const edited = values({ model: "Typed while reviewing" });
    const fresh = review(
      [analysis({ model: "New", civIssuedAt: "2025-01-15" })],
      edited,
      [file()],
      current,
    );
    const applied = selectedReextraction(
      fresh.proposals,
      selections,
      {},
      fresh.evidence ?? {},
      [file()],
      edited,
    );
    expect(applied.values).toEqual({ civIssuedAt: "2025-01-15" });
    expect(applied.extractedDocuments?.civ?.fields).toEqual({});
    expect(
      applied.extractedDocuments?.civ?.reextractionHistory?.[0]?.changes,
    ).toEqual([
      { field: "field:civIssuedAt", previous: "", next: "2025-01-15" },
    ]);
    expect(
      v1.scooters.scooterDocumentExtractedDataSchema.safeParse(
        applied.extractedDocuments?.civ,
      ).success,
    ).toBe(true);
  });
  it("retains previous evidence and manual VIN reviews when new document readings are accepted", () => {
    const previous = {
      vin,
      fields: { model: "Old", engineSerialNumber: null },
      rawFields: { original: "text" },
      vinReview: { method: "manual" as const, originalVin: null },
    };
    const files = [file(previous)];
    const result = review(
      [analysis({ model: "New" }, { additional: "value" })],
      values(),
      files,
    );
    const candidate = result.proposals.find(
      (item) => item.kind === "document",
    )!;
    const applied = selectedReextraction(
      result.proposals,
      { [candidate.id]: candidate },
      {},
      result.evidence!,
      files,
      values(),
    );
    expect(
      applied.extractedDocuments?.civ?.reextractionHistory?.[0]?.evidence,
    ).toEqual(previous);
    expect(applied.extractedDocuments?.civ?.vinReview).toEqual(
      previous.vinReview,
    );
    expect(applied.extractedDocuments?.civ?.rawFields).toEqual({
      original: "text",
      additional: "value",
    });
    expect(
      v1.scooters.scooterDocumentExtractedDataSchema.safeParse(
        applied.extractedDocuments?.civ,
      ).success,
    ).toBe(true);
  });
  it("keeps logical document IDs, human insurance selection, and old ITP rows", () => {
    const inspection = {
      inspectionDate: "2025-01-15",
      validUntil: "2027-01-15",
      result: "passed" as const,
      certificateNumber: null,
      odometerKm: 0,
      rawFields: {},
    };
    const previous = {
      vin,
      fields: {},
      rawFields: {},
      currentInsuranceDocumentId: null,
      documents: [
        {
          id: "old",
          documentType: "itp_card" as const,
          pages: [1],
          vin: null,
          fields: {},
          rawFields: {},
          inspections: [inspection],
        },
      ],
    };
    const merged = mergeReextractedEvidence(previous, {
      vin,
      fields: {},
      rawFields: {},
      documents: [
        { ...previous.documents[0]!, id: "fresh", inspections: [inspection] },
      ],
    });
    expect(merged.documents).toHaveLength(1);
    expect(merged.documents?.[0]?.id).toBe("old");
    expect(merged.documents?.[0]?.inspections).toEqual([inspection]);
    expect(merged.currentInsuranceDocumentId).toBeNull();
  });
  it("reports no differences for identical readings regardless of field key order", () => {
    const existing = {
      vin,
      fields: { model: "NMAX", color: "Blue" },
      rawFields: {},
    };
    const result = review(
      [analysis({ color: "Blue", model: "NMAX" })],
      values({ model: "NMAX", color: "Blue" }),
      [file(existing)],
    );
    expect(result.proposals).toEqual([]);
  });
});
