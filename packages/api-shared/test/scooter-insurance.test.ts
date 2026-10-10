import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { v1 } from "../src";

const policy = {
  id: "policy",
  insuredName: "Example SRL",
  validFrom: "2026-01-01",
  validUntil: "2026-12-31",
  premiumAmount: 250.55,
  currency: "RON",
  documentVin: "LXYTCKP05P0000001",
  vinReviewConfirmed: false,
};
test("insurance validates coverage dates, money, VIN and explicit review", () => {
  assert.ok(v1.scooters.insurancePolicyInputSchema.safeParse(policy).success);
  for (const change of [
    { validUntil: "2025-01-01" },
    { premiumAmount: -1 },
    { premiumAmount: 1.234 },
    { currency: "lei" },
    { documentVin: "bad" },
    { documentVin: null },
  ])
    assert.equal(
      v1.scooters.insurancePolicyInputSchema.safeParse({ ...policy, ...change })
        .success,
      false,
    );
  assert.ok(
    v1.scooters.insurancePolicyInputSchema.safeParse({
      ...policy,
      premiumAmount: 0,
      documentVin: null,
      vinReviewConfirmed: true,
    }).success,
  );
  assert.ok(
    v1.scooters.insurancePolicyInputSchema.safeParse({
      ...policy,
      validFrom: null,
      validUntil: null,
      premiumAmount: null,
      currency: null,
    }).success,
  );
  assert.equal(
    v1.scooters.insurancePoliciesInputSchema.safeParse([policy, policy])
      .success,
    false,
  );
  assert.equal(
    v1.scooters.updateScooterInputSchema.safeParse({
      vin: "LXYTCKP05P0000002",
      insurancePolicies: [policy],
    }).success,
    false,
  );
});
test("insurance statuses include both date endpoints and allow overlaps", () => {
  assert.equal(v1.scooters.insuranceStatus(policy, "2026-01-01"), "active");
  assert.equal(v1.scooters.insuranceStatus(policy, "2026-12-31"), "active");
  assert.equal(v1.scooters.insuranceStatus(policy, "2025-12-31"), "upcoming");
  assert.equal(v1.scooters.insuranceStatus(policy, "2027-01-01"), "expired");
  assert.equal(
    v1.scooters.insuranceStatus({ ...policy, validFrom: null }),
    "review",
  );
  assert.equal(
    v1.scooters.insurancePeriodsOverlap([
      policy,
      { validFrom: "2026-12-31", validUntil: "2027-12-30" },
    ]),
    true,
  );
  assert.equal(
    v1.scooters.insurancePeriodsOverlap([
      policy,
      { validFrom: "2027-01-01", validUntil: "2027-12-31" },
    ]),
    false,
  );
});
test("insurance schemas remain representable in OpenAPI JSON schema", () => {
  assert.doesNotThrow(() =>
    z.toJSONSchema(v1.scooters.createScooterInputSchema),
  );
  assert.doesNotThrow(() => z.toJSONSchema(v1.scooters.scooterSchema));
});
