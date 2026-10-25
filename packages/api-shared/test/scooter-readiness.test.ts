import assert from "node:assert/strict";
import test from "node:test";
import { scooterReadinessIssues } from "../src/v1/scooters/scooter-readiness";
const ready = {
  hasCivDocument: true,
  registrationType: "national" as const,
  registrationNumber: "B123ABC",
  temporaryRegistrationExpiresAt: null,
  rentalInsuranceStatus: "active" as const,
  itpStatus: "active" as const,
};
test("readiness stops at the first missing prerequisite", () => {
  assert.deepEqual(
    scooterReadinessIssues({
      ...ready,
      hasCivDocument: false,
      registrationType: "unregistered",
      rentalInsuranceStatus: "missing",
    }),
    ["needsCiv"],
  );
  assert.deepEqual(
    scooterReadinessIssues({
      ...ready,
      registrationType: "unregistered",
      rentalInsuranceStatus: "missing",
    }),
    ["needsRegistration"],
  );
});
test("registered scooters report insurance and ITP independently", () => {
  assert.deepEqual(scooterReadinessIssues(ready), []);
  assert.deepEqual(
    scooterReadinessIssues({ ...ready, rentalInsuranceStatus: "missing" }),
    ["invalidInsurance"],
  );
  assert.deepEqual(scooterReadinessIssues({ ...ready, itpStatus: "expired" }), [
    "invalidItp",
  ]);
  assert.deepEqual(
    scooterReadinessIssues({
      ...ready,
      rentalInsuranceStatus: "upcoming",
      itpStatus: "failed",
    }),
    ["invalidInsurance", "invalidItp"],
  );
  assert.deepEqual(
    scooterReadinessIssues({ ...ready, itpStatus: "expiring" }),
    [],
  );
});
test("expired or undated temporary registration requires registration", () => {
  for (const expiry of [null, "2026-10-24"])
    assert.deepEqual(
      scooterReadinessIssues(
        {
          ...ready,
          registrationType: "temporary",
          temporaryRegistrationExpiresAt: expiry,
        },
        "2026-10-25",
      ),
      ["needsRegistration"],
    );
  assert.deepEqual(
    scooterReadinessIssues(
      {
        ...ready,
        registrationType: "temporary",
        temporaryRegistrationExpiresAt: "2026-10-25",
      },
      "2026-10-25",
    ),
    [],
  );
});
