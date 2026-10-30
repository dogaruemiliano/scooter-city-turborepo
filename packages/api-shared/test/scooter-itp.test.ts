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

test("manual ITP validity is distinct from an appointment and does not imply a passed result", () => {
  const input = {
    source: "manual",
    expectedLatestId: null,
    inspectionDate: null,
    validUntil: "2027-01-01",
    result: "unknown" as const,
    certificateNumber: null,
    odometerKm: null,
    cardDocumentId: null,
    certificateDocumentId: null,
    evidenceReviewed: true,
  };
  assert.ok(scooterItpInputSchema.safeParse(input).success);
  assert.equal(
    scooterItpSummary([{ ...input, effectiveDate: "2026-10-30" }], "2026-10-30")
      .status,
    "review",
  );
  assert.equal(
    scooterItpSummary(
      [{ ...input, result: "passed", effectiveDate: "2026-10-30" }],
      "2026-10-30",
    ).status,
    "active",
  );
  assert.equal(
    scooterItpInputSchema.safeParse({ ...input, inspectionDate: "2099-01-01" })
      .success,
    false,
  );
});
test("manual validity supersedes CIV fallback and retains later known failures", () => {
  const manual = {
    inspectionDate: null,
    effectiveDate: "2026-10-01",
    validUntil: "2027-01-01",
    result: "passed" as const,
  };
  assert.equal(
    scooterItpSummary([manual], "2026-10-30", "2020-01-01").status,
    "active",
  );
  assert.equal(
    scooterItpSummary(
      [
        manual,
        { inspectionDate: "2026-10-20", validUntil: null, result: "failed" },
      ],
      "2026-10-30",
    ).status,
    "failed",
  );
});
