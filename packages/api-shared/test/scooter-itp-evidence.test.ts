import assert from "node:assert/strict";
import test from "node:test";
import { v1 } from "../src";

const today = "2026-11-03";
const certificate: v1.scooters.ScooterDocumentInspection = {
  inspectionDate: "2026-09-14",
  validUntil: null,
  result: "passed",
  certificateNumber: "B0123ABC45 / DD12345",
  odometerKm: 1234,
  rawFields: {},
};
const card: v1.scooters.ScooterDocumentInspection = {
  inspectionDate: null,
  validUntil: "2028-09-14",
  result: null,
  certificateNumber: "B0123 ABC45",
  odometerKm: null,
  rawFields: { date: "14 / 09 / 28" },
};
function document(
  type: "itp_card" | "itp_certificate",
  inspections: v1.scooters.ScooterDocumentInspection[],
  id = type as string,
) {
  return {
    id,
    type,
    fileName: `${id}.pdf`,
    extractedData: {
      vin: null,
      fields: {},
      rawFields: {},
      documents: [
        {
          id: "logical",
          documentType: type,
          pages: [1],
          vin: null,
          fields: {},
          rawFields: {},
          inspections,
        },
      ],
    },
  };
}
const resolve = (documents: ReturnType<typeof document>[]) =>
  v1.scooters.scooterItpEvidence(documents, today);

test("the certificate and yellow card supply complementary evidence in either upload order", () => {
  const documents = [
    document("itp_certificate", [certificate]),
    document("itp_card", [card]),
  ];
  const original = structuredClone(documents);
  for (const input of [documents, [...documents].reverse()]) {
    const rows = resolve(input);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.validUntil, "2028-09-14");
    assert.equal(rows[0]?.inspectionDate, "2026-09-14");
    assert.equal(rows[0]?.result, "passed");
    assert.equal(rows[0]?.conflicts, false);
    assert.deepEqual(
      rows[0]?.sources.map((source) => source.documentId),
      ["itp_certificate", "itp_card"],
    );
    for (const doc of input)
      assert.equal(
        v1.scooters.scooterDocumentState(doc, today, doc.type, input),
        "current",
      );
  }
  assert.deepEqual(documents, original);
});

test("matching also works inside one mixed PDF and keeps logical source identity", () => {
  const cert = document("itp_certificate", [certificate]);
  const yellow = document("itp_card", [card]);
  cert.extractedData.documents.push({
    ...yellow.extractedData.documents[0]!,
    id: "card",
  });
  const rows = resolve([cert]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.validUntil, card.validUntil);
  assert.deepEqual(
    rows[0]?.sources.map((source) => source.logicalDocumentId),
    ["logical", "card"],
  );
});

test("a lone pair can match without a register reference; unrelated explicit references never match", () => {
  assert.equal(
    resolve([
      document("itp_certificate", [
        { ...certificate, certificateNumber: null },
      ]),
      document("itp_card", [{ ...card, certificateNumber: null }]),
    ]).length,
    1,
  );
  const rows = resolve([
    document("itp_certificate", [certificate]),
    document("itp_card", [{ ...card, certificateNumber: "OTHER" }]),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(
    v1.scooters.scooterItpEvidenceConflicts(
      v1.scooters.latestScooterItpEvidence(rows),
    ),
    true,
  );
});

test("a next-inspection date alone never supplies a passed result or an inspection date", () => {
  const [reading] = resolve([document("itp_card", [card])]);
  assert.equal(reading?.inspectionDate, null);
  assert.equal(reading?.result, null);
  assert.equal(reading?.validUntil, card.validUntil);
  assert.equal(
    v1.scooters.scooterItpSummary(
      [{ ...reading!, result: reading!.result ?? "unknown" }],
      today,
    ).status,
    "review",
  );
});

test("conflicting known expiry dates or results require review, while missing values do not conflict", () => {
  for (const overrides of [
    { validUntil: "2027-09-14" },
    { result: "failed" as const },
  ]) {
    const docs = [
      document("itp_certificate", [{ ...certificate, ...overrides }]),
      document("itp_card", [{ ...card, result: "passed" }]),
    ];
    const rows = resolve(docs);
    assert.equal(v1.scooters.scooterItpEvidenceConflicts(rows), true);
    assert.equal(
      v1.scooters.scooterDocumentState(
        docs[0]!,
        today,
        "itp_certificate",
        docs,
      ),
      "unknown",
    );
  }
});

test("history is matched by register reference, never by upload order or the largest expiry", () => {
  const rows = resolve([
    document("itp_certificate", [certificate]),
    document("itp_card", [
      { ...card, certificateNumber: "OLD", validUntil: "2024-09-14" },
      card,
    ]),
  ]);
  const latest = v1.scooters.latestScooterItpEvidence(rows);
  assert.equal(latest.length, 1);
  assert.equal(latest[0]?.validUntil, card.validUntil);
  assert.equal(v1.scooters.scooterItpEvidenceConflicts(latest), false);
});

test("multiple plausible rows require review instead of attaching an arbitrary card", () => {
  const rows = resolve([
    document("itp_certificate", [{ ...certificate, certificateNumber: null }]),
    document("itp_card", [card, { ...card, validUntil: "2029-01-01" }]),
  ]);
  assert.equal(rows.length, 3);
  assert.equal(
    v1.scooters.scooterItpEvidenceConflicts(
      v1.scooters.latestScooterItpEvidence(rows),
    ),
    true,
  );
});

test("future appointments, protected client copies and malformed evidence cannot supply validity", () => {
  const original = document("itp_card", [card]);
  assert.equal(
    resolve([
      document("itp_certificate", [
        { ...certificate, inspectionDate: "2099-01-01" },
      ]),
    ]).length,
    0,
  );
  assert.equal(
    v1.scooters.scooterItpEvidence(
      [{ ...original, version: "client_copy" }],
      today,
    ).length,
    0,
  );
  assert.equal(
    v1.scooters.scooterItpEvidence(
      [
        {
          ...original,
          extractedData: { ...original.extractedData, clientCopy: true },
        },
      ],
      today,
    ).length,
    0,
  );
  assert.equal(
    v1.scooters.scooterItpEvidence(
      [{ id: "bad", extractedData: { invalid: true } }],
      today,
    ).length,
    0,
  );
});
