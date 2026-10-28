import assert from "node:assert/strict";
import test from "node:test";
import {
  initialScooterItpExpiry,
  scooterItpSummary,
} from "../src/v1/scooters/scooter-itp.schemas";
import {
  missingScooterClientDocuments,
  scooterDocumentDisplayEntries,
  scooterItpDocumentsDue,
} from "../src/v1/scooters/scooter-document-lifecycle";
const today = "2026-10-28";
const policy = (id: string, validFrom: string, validUntil: string) => ({
  id,
  type: "insurance",
  validFrom,
  validUntil,
});
test("CIV establishes two calendar years of ITP validity, including leap-day issuance", () => {
  assert.equal(initialScooterItpExpiry("2024-02-29"), "2026-02-28");
  assert.equal(initialScooterItpExpiry("not a date"), null);
  assert.equal(
    scooterItpSummary([], today, "2026-01-02").validUntil,
    "2028-01-02",
  );
  assert.equal(scooterItpSummary([], today, "2024-11-27").status, "expiring");
  assert.equal(scooterItpSummary([], today, "2024-10-27").status, "expired");
  assert.equal(
    scooterItpSummary(
      [
        {
          inspectionDate: "2026-01-01",
          validUntil: "2026-10-01",
          result: "passed",
        },
      ],
      today,
      "2026-01-02",
    ).status,
    "expired",
  );
});
test("ITP renewal ghosts appear at the inclusive thirty-day boundary, not for unknown CIV dates", () => {
  assert.equal(scooterItpDocumentsDue("2026-11-27", today), true);
  assert.equal(scooterItpDocumentsDue("2026-11-28", today), false);
  assert.equal(scooterItpDocumentsDue(null, today), false);
});
test("expired history stays at its slot until replaced and then moves after all document types", () => {
  const old = policy("old", "2024-01-01", "2025-01-01");
  const other = { id: "other", type: "other" };
  assert.deepEqual(
    scooterDocumentDisplayEntries([other, old], today).map((entry) => [
      entry.document.id,
      entry.badge,
    ]),
    [
      ["old", "expired"],
      ["other", undefined],
    ],
  );
  const current = policy("current", "2026-01-01", "2027-01-01");
  assert.deepEqual(
    scooterDocumentDisplayEntries([old, other, current], today).map(
      (entry) => entry.document.id,
    ),
    ["current", "other", "old"],
  );
});
test("current insurance precedes future coverage; overlapping current policies mark the newest", () => {
  const current = policy("current", "2026-01-01", "2026-11-11");
  const next = policy("next", "2026-11-12", "2027-11-11");
  assert.deepEqual(
    scooterDocumentDisplayEntries([next, current], today).map((entry) => [
      entry.document.id,
      entry.badge,
    ]),
    [
      ["current", undefined],
      ["next", "next"],
    ],
  );
  const newer = policy("newer", "2026-10-01", "2027-10-01");
  assert.equal(
    scooterDocumentDisplayEntries([current, newer], today).find(
      (entry) => entry.document.id === "newer",
    )?.badge,
    "newest",
  );
});
test("client copies occupy their own ordered slots and future or expired policies never satisfy rental requirements", () => {
  const documents = [
    { id: "reg", type: "registration_certificate", clientCopy: {} },
    { id: "civ", type: "civ", clientCopy: {} },
    { ...policy("policy", "2026-01-01", "2027-01-01"), clientCopy: {} },
  ];
  assert.deepEqual(
    scooterDocumentDisplayEntries(documents, today).map((entry) => [
      entry.type,
      entry.clientCopy,
    ]),
    [
      ["civ", false],
      ["civ", true],
      ["registration_certificate", false],
      ["registration_certificate", true],
      ["insurance", false],
      ["insurance", true],
    ],
  );
  assert.deepEqual(missingScooterClientDocuments(documents, false, today), []);
  assert.deepEqual(missingScooterClientDocuments(documents, true, today), [
    "itp_certificate",
    "itp_card",
  ]);
  assert.deepEqual(
    missingScooterClientDocuments(
      documents
        .slice(0, 2)
        .concat({
          ...policy("next", "2026-11-12", "2027-11-11"),
          clientCopy: {},
        }),
      false,
      today,
    ),
    ["insurance"],
  );
});
