import assert from "node:assert/strict";
import test from "node:test";

import { v1 } from "../src";

test("scooter input schemas reject future purchase dates", () => {
  const today = v1.common.dateOnlyToday();
  const tomorrow = addDateOnlyDays(today, 1);

  assert.equal(
    v1.scooters.createScooterInputSchema.parse({
      vin: "JYARN23E0RA123456",
      brand: "Yamaha",
      model: "NMAX",
      color: "White",
      manufactureYear: 2026,
      powertrainType: "combustion",
      cylinderCapacityCc: 125,
      purchasedOn: today,
      notes: null,
    }).purchasedOn,
    today,
  );
  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      vin: "JYARN23E0RA123457",
      brand: "Yamaha",
      model: "NMAX",
      color: "White",
      manufactureYear: 2026,
      powertrainType: "combustion",
      cylinderCapacityCc: 125,
      purchasedOn: tomorrow,
      notes: null,
    }).success,
    false,
  );
  assert.equal(
    v1.scooters.updateScooterInputSchema.parse({ purchasedOn: today })
      .purchasedOn,
    today,
  );
  assert.equal(
    v1.scooters.updateScooterInputSchema.safeParse({ purchasedOn: tomorrow })
      .success,
    false,
  );
});

function addDateOnlyDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
