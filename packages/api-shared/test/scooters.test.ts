import assert from "node:assert/strict";
import test from "node:test";

import { v1 } from "../src";

const today = v1.common.dateOnlyToday();
const tomorrow = addDateOnlyDays(today, 1);

test("scooter input schemas reject future purchase dates", () => {
  assert.equal(
    v1.scooters.createScooterInputSchema.parse({
      vin: "JYARN23E0RA123456",
      brand: "Yamaha",
      model: "NMAX",
      color: "White",
      manufactureYear: 2026,
      powertrainType: "combustion",
      engineCc: 125,
      powerKw: 9.5,
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
      engineCc: 125,
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

test("scooter create schema accepts registered scooters", () => {
  assert.equal(
    v1.scooters.createScooterInputSchema.parse({
      ...baseScooterInput(),
      registrationType: "national",
      plateNumber: "CJ 12 ABC",
      registeredOn: today,
      requiredDriverLicenseType: "A1",
    }).registrationType,
    "national",
  );

  assert.equal(
    v1.scooters.createScooterInputSchema.parse({
      ...baseScooterInput({ vin: "JYARN23E0RA123458" }),
      registrationType: "local",
      plateNumber: "CLUJ-123",
      registeredOn: today,
      requiredDriverLicenseType: "none",
    }).requiredDriverLicenseType,
    "none",
  );

  assert.equal(
    v1.scooters.createScooterInputSchema.parse({
      ...baseScooterInput({ vin: "JYARN23E0RA123459" }),
      registrationType: "temporary",
      plateNumber: "B 012345",
      registeredOn: today,
      registrationExpiresOn: today,
      requiredDriverLicenseType: "AM",
    }).registrationExpiresOn,
    today,
  );
});

test("scooter registration schema enforces unregistered and date rules", () => {
  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...baseScooterInput(),
      registrationType: "unregistered",
      plateNumber: "CJ 12 ABC",
    }).success,
    false,
  );

  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...baseScooterInput(),
      registrationType: "temporary",
      plateNumber: "CJ 0123",
      registeredOn: today,
      requiredDriverLicenseType: "AM",
    }).success,
    false,
  );

  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...baseScooterInput(),
      registrationType: "national",
      plateNumber: "CJ 12 ABC",
      registeredOn: tomorrow,
      requiredDriverLicenseType: "A1",
    }).success,
    false,
  );

  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...baseScooterInput(),
      registrationType: "temporary",
      plateNumber: "CJ 0123",
      registeredOn: today,
      registrationExpiresOn: addDateOnlyDays(today, -1),
      requiredDriverLicenseType: "AM",
    }).success,
    false,
  );

  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...baseScooterInput(),
      registrationType: "national",
      plateNumber: "CJ 12 ABC",
      registeredOn: today,
      registrationExpiresOn: today,
      requiredDriverLicenseType: "A1",
    }).success,
    false,
  );

  assert.equal(
    v1.scooters.updateScooterInputSchema.safeParse({
      registrationType: "local",
      registrationExpiresOn: today,
    }).success,
    false,
  );
});

test("scooter licence enum accepts expected categories", () => {
  for (const requiredDriverLicenseType of ["none", "AM", "A1", "A2", "A"]) {
    assert.equal(
      v1.scooters.updateScooterInputSchema.parse({
        requiredDriverLicenseType,
      }).requiredDriverLicenseType,
      requiredDriverLicenseType,
    );
  }
});

test("national plate validation accepts and rejects Romanian permanent plates", () => {
  assertPlate("national", "CJ 12 ABC", "CJ 12 ABC", "CJ12ABC");
  assertPlate("national", "B 12 ABC", "B 12 ABC", "B12ABC");
  assertPlate("national", "B 123 ABC", "B 123 ABC", "B123ABC");

  assertInvalidPlate("national", "CJ 00 ABC");
  assertInvalidPlate("national", "XX 12 ABC");
  assertInvalidPlate("national", "CJ 12 IBC");
  assertInvalidPlate("national", "CJ 12 OBC");
  assertInvalidPlate("national", "CJ 12 ABQ");
});

test("temporary plate validation accepts Romanian provisional plates", () => {
  assertPlate("temporary", "CJ 0123", "CJ 0123", "CJ0123");
  assertPlate("temporary", "B 012345", "B 012345", "B012345");

  assertInvalidPlate("temporary", "CJ 1234");
  assertInvalidPlate("temporary", "CJ 0012");
  assertInvalidPlate("temporary", "CJ 01");
  assertInvalidPlate("temporary", "CJ 0123456");
});

test("local plate validation allows constrained local identifiers", () => {
  assertPlate("local", "cluj-123", "CLUJ-123", "CLUJ123");
  assertPlate("local", "Sector 1 45", "SECTOR 1 45", "SECTOR145");

  assertInvalidPlate("local", "LOCAL");
  assertInvalidPlate("local", "-LOCAL123");
  assertInvalidPlate("local", "LOCAL123!");
  assertInvalidPlate("local", "LOCAL-123-456-789-123-456-789-123-456");
});

function assertPlate(
  registrationType: v1.scooters.ScooterRegistrationType,
  plateNumber: string,
  displayValue: string,
  compactValue: string,
): void {
  assert.deepEqual(
    v1.scooters.validatePlateForRegistrationType(registrationType, plateNumber),
    {
      registrationType,
      displayValue,
      compactValue,
    },
  );
}

function assertInvalidPlate(
  registrationType: v1.scooters.ScooterRegistrationType,
  plateNumber: string,
): void {
  assert.equal(
    v1.scooters.validatePlateForRegistrationType(registrationType, plateNumber),
    null,
  );
}

function baseScooterInput(overrides: Record<string, unknown> = {}) {
  return {
    vin: "JYARN23E0RA123456",
    brand: "Yamaha",
    model: "NMAX",
    color: "White",
    manufactureYear: 2026,
    powertrainType: "combustion",
    engineCc: 125,
    purchasedOn: today,
    notes: null,
    ...overrides,
  };
}

function addDateOnlyDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
