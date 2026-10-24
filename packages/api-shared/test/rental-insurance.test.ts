import assert from "node:assert/strict";
import test from "node:test";
import { v1 } from "../src";

test("rental insurance distinguishes missing policies from active cover", () => {
  const status = v1.scooters.rentalInsuranceStatus;
  const today = "2026-10-24";
  assert.equal(status([], today), "missing");
  assert.equal(
    status([{ validFrom: "2026-01-01", validUntil: "2026-12-31" }], today),
    "active",
  );
  assert.equal(
    status([{ validFrom: "2026-01-01", validUntil: "2026-10-23" }], today),
    "expired",
  );
  assert.equal(
    status([{ validFrom: "2026-10-25", validUntil: "2026-12-31" }], today),
    "upcoming",
  );
  assert.equal(
    status([{ validFrom: null, validUntil: null }], today),
    "review",
  );
  assert.equal(
    status(
      [
        { validFrom: null, validUntil: null },
        { validFrom: "2026-10-01", validUntil: "2026-12-31" },
      ],
      today,
    ),
    "active",
  );
});
