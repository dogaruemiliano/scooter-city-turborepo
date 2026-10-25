import assert from "node:assert/strict";
import test from "node:test";
import {
  scooterItpSummary,
  scooterItpInputSchema,
} from "../src/v1/scooters/scooter-itp.schemas";

test("ITP uses the latest inspection rather than the longest historical validity", () => {
  assert.deepEqual(
    scooterItpSummary(
      [
        {
          inspectionDate: "2025-01-01",
          validUntil: "2028-01-01",
          result: "passed",
        },
        {
          inspectionDate: "2026-01-01",
          validUntil: "2026-10-01",
          result: "passed",
        },
      ],
      "2026-10-24",
    ),
    { status: "expired", validUntil: "2026-10-01", renewalRequired: true },
  );
});
test("ITP states distinguish missing, unreadable, failed and near expiry", () => {
  assert.equal(scooterItpSummary([], "2026-10-24").status, "missing");
  for (const [result, validUntil, status] of [
    ["unknown", null, "review"],
    ["failed", "2027-01-01", "failed"],
    ["passed", "2026-11-01", "expiring"],
    ["passed", "2027-01-01", "active"],
    ["passed", "2026-10-24", "expiring"],
  ] as const) {
    assert.equal(
      scooterItpSummary(
        [{ inspectionDate: "2026-01-01", result, validUntil }],
        "2026-10-24",
      ).status,
      status,
    );
  }
});
test("ITP confirmation requires reviewed paired evidence and explicit validity for a pass", () => {
  const input = {
    inspectionDate: "2026-01-01",
    validUntil: "2027-01-01",
    result: "passed",
    certificateNumber: "CERT-1",
    odometerKm: 0,
    cardDocumentId: "card",
    certificateDocumentId: "certificate",
    evidenceReviewed: true,
  };
  assert.ok(scooterItpInputSchema.safeParse(input).success);
  for (const override of [
    { evidenceReviewed: false },
    { certificateDocumentId: "" },
    { validUntil: null },
    { validUntil: "2025-01-01" },
  ])
    assert.equal(
      scooterItpInputSchema.safeParse({ ...input, ...override }).success,
      false,
    );
});
