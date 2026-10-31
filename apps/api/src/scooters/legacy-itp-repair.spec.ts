import { legacyItpRepairPlan } from "./legacy-itp-repair";

const today = "2026-10-30";
const document = (date: string, type = "civ") => ({
  type,
  extractedData: { vin: null, fields: { civIssuedAt: date }, rawFields: {} },
});
const manual = {
  id: "manual",
  source: "manual",
  result: "unknown",
  validUntil: "2028-08-21",
  inspectionDate: null,
  cardDocumentId: null,
  certificateDocumentId: null,
};
const base = { civIssuedAt: null, documents: [], inspections: [] };

it("repairs missing metadata and a lone redundant manual entry from stored CIV evidence", () => {
  expect(
    legacyItpRepairPlan(
      { ...base, documents: [document("2026-08-21")], inspections: [manual] },
      today,
    ),
  ).toMatchObject({
    civIssuedAt: "2026-08-21",
    confirmInspectionId: "manual",
    needsCivReview: false,
    needsItpReview: false,
  });
});
it("uses a classified CIV child even when its physical upload is another type", () => {
  expect(
    legacyItpRepairPlan(
      {
        ...base,
        documents: [
          {
            type: "other",
            extractedData: {
              vin: null,
              fields: {},
              rawFields: {},
              documents: [
                {
                  id: "civ",
                  documentType: "civ",
                  pages: [1],
                  vin: null,
                  fields: { civIssuedAt: "2026-08-21" },
                  rawFields: {},
                },
              ],
            },
          },
        ],
      },
      today,
    ).civIssuedAt,
  ).toBe("2026-08-21");
});
it.each(["2099-01-01", "invalid"])(
  "rejects unsafe stored dates: %s",
  (date) => {
    const plan = legacyItpRepairPlan(
      { ...base, documents: [document(date)] },
      today,
    );
    expect(plan.civIssuedAt).toBeNull();
    expect(plan.needsCivReview).toBe(true);
  },
);
it("does not choose between conflicting CIV dates or read dates from registration", () => {
  expect(
    legacyItpRepairPlan(
      { ...base, documents: [document("2026-01-01"), document("2026-08-21")] },
      today,
    ),
  ).toMatchObject({ civIssuedAt: null, conflictingEvidence: true });
  expect(
    legacyItpRepairPlan(
      {
        ...base,
        documents: [document("2026-08-21", "registration_certificate")],
      },
      today,
    ).civIssuedAt,
  ).toBeNull();
});
it("never overwrites an existing CIV date", () => {
  expect(
    legacyItpRepairPlan(
      {
        ...base,
        civIssuedAt: "2025-01-01",
        documents: [document("2026-08-21")],
      },
      today,
    ).civIssuedAt,
  ).toBeNull();
});
it.each([
  { inspections: [{ ...manual, result: "failed" }] },
  { inspections: [{ ...manual, source: "document" }] },
  { inspections: [{ ...manual, inspectionDate: "2026-08-21" }] },
  { inspections: [{ ...manual, cardDocumentId: "card" }] },
  { inspections: [{ ...manual, validUntil: "2029-01-01" }] },
  { inspections: [manual, { ...manual, id: "earlier", result: "failed" }] },
])(
  "does not auto-confirm actual inspections, failures or unrelated manual history: %j",
  ({ inspections }) => {
    expect(
      legacyItpRepairPlan(
        { ...base, civIssuedAt: "2026-08-21", inspections },
        today,
      ).confirmInspectionId,
    ).toBeNull();
  },
);
it("is idempotent after applying the repair", () => {
  expect(
    legacyItpRepairPlan(
      {
        ...base,
        civIssuedAt: "2026-08-21",
        inspections: [{ ...manual, result: "passed" }],
      },
      today,
    ),
  ).toMatchObject({
    civIssuedAt: null,
    confirmInspectionId: null,
    needsItpReview: false,
  });
});
