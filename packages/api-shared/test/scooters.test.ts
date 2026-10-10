import assert from "node:assert/strict";
import test from "node:test";

import { v1 } from "../src";

const today = v1.common.dateOnlyToday();
const tomorrow = addDateOnlyDays(today, 1);

test("scooter create schema accepts a valid scooter", () => {
  assert.equal(
    v1.scooters.createScooterInputSchema.parse({
      vin: "JYARN23E0RA123456",
      brandId: "brand-1",
      model: "NMAX",
      color: "White",
      manufactureYear: 2026,
      powertrainType: "combustion",
      engineDisplacementCc: 125,
      powerKw: 9.5,
      notes: null,
    }).brandId,
    "brand-1",
  );
});

test("scooter mileage remains optional and constrained to nonnegative whole kilometres", () => {
  for (const currentMileageKm of [0, 12_250, 2_147_483_647, null]) {
    assert.equal(
      v1.scooters.createScooterInputSchema.parse({
        ...baseScooterInput(),
        currentMileageKm,
      }).currentMileageKm,
      currentMileageKm,
    );
    assert.equal(
      v1.scooters.updateScooterInputSchema.parse({ currentMileageKm })
        .currentMileageKm,
      currentMileageKm,
    );
  }
  for (const currentMileageKm of [-1, 0.5, 2_147_483_648]) {
    assert.equal(
      v1.scooters.createScooterInputSchema.safeParse({
        ...baseScooterInput(),
        currentMileageKm,
      }).success,
      false,
    );
    assert.equal(
      v1.scooters.updateScooterInputSchema.safeParse({ currentMileageKm })
        .success,
      false,
    );
  }
});

test("scooter list items use the basic scooter contract", () => {
  const scooter = {
    id: "scooter-1",
    vin: "JYARN23E0RA123456",
    brandId: "brand-1",
    brand: "Yamaha",
    brandCode: "YAM",
    model: "NMAX",
    color: "White",
    manufactureYear: 2026,
    powertrainType: "combustion",
    engineCode: null,
    engineDisplacementCc: 125,
    powerKw: 9.5,
    registrationType: "unregistered",
    registrationNumber: null,
    registrationDate: null,
    temporaryRegistrationExpiresAt: null,
    requiredLicenseCategory: "A1",
    currentMileageKm: 12_250,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
  const parsed = v1.scooters.scooterListItemSchema.parse(scooter);
  assert.deepEqual(parsed, v1.scooters.scooterSchema.parse(scooter));
  assert.equal(parsed.currentMileageKm, 12_250);
  assert.equal("attentionSummary" in parsed, false);
});

test("scooter create schema accepts registered scooters", () => {
  assert.equal(
    v1.scooters.createScooterInputSchema.parse({
      ...baseScooterInput(),
      registrationType: "national",
      registrationNumber: "CJ 12 ABC",
      registrationDate: today,
      requiredLicenseCategory: "A1",
    }).registrationType,
    "national",
  );

  assert.equal(
    v1.scooters.createScooterInputSchema.parse({
      ...baseScooterInput({ vin: "JYARN23E0RA123458" }),
      registrationType: "local",
      registrationNumber: "CLUJ-123",
      registrationDate: today,
      requiredLicenseCategory: "none",
    }).requiredLicenseCategory,
    "none",
  );

  assert.equal(
    v1.scooters.createScooterInputSchema.parse({
      ...baseScooterInput({ vin: "JYARN23E0RA123459" }),
      registrationType: "temporary",
      registrationNumber: "B 012345",
      registrationDate: today,
      temporaryRegistrationExpiresAt: today,
      requiredLicenseCategory: "AM",
    }).temporaryRegistrationExpiresAt,
    today,
  );
});

test("scooter registration schema enforces unregistered and date rules", () => {
  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...baseScooterInput(),
      registrationType: "unregistered",
      registrationNumber: "CJ 12 ABC",
    }).success,
    false,
  );

  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...baseScooterInput(),
      registrationType: "temporary",
      registrationNumber: "CJ 0123",
      registrationDate: today,
      requiredLicenseCategory: "AM",
    }).success,
    false,
  );

  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...baseScooterInput(),
      registrationType: "national",
      registrationNumber: "CJ 12 ABC",
      registrationDate: tomorrow,
      requiredLicenseCategory: "A1",
    }).success,
    false,
  );

  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...baseScooterInput(),
      registrationType: "temporary",
      registrationNumber: "CJ 0123",
      registrationDate: today,
      temporaryRegistrationExpiresAt: addDateOnlyDays(today, -1),
      requiredLicenseCategory: "AM",
    }).success,
    false,
  );

  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...baseScooterInput(),
      registrationType: "national",
      registrationNumber: "CJ 12 ABC",
      registrationDate: today,
      temporaryRegistrationExpiresAt: today,
      requiredLicenseCategory: "A1",
    }).success,
    false,
  );

  assert.equal(
    v1.scooters.updateScooterInputSchema.safeParse({
      registrationType: "local",
      temporaryRegistrationExpiresAt: today,
    }).success,
    false,
  );
});

test("scooter licence enum accepts expected categories", () => {
  for (const requiredLicenseCategory of ["none", "AM", "A1", "A2", "A"]) {
    assert.equal(
      v1.scooters.updateScooterInputSchema.parse({
        requiredLicenseCategory,
      }).requiredLicenseCategory,
      requiredLicenseCategory,
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
  registrationNumber: string,
  displayValue: string,
  compactValue: string,
): void {
  assert.deepEqual(
    v1.scooters.validatePlateForRegistrationType(
      registrationType,
      registrationNumber,
    ),
    {
      registrationType,
      displayValue,
      compactValue,
    },
  );
}

function assertInvalidPlate(
  registrationType: v1.scooters.ScooterRegistrationType,
  registrationNumber: string,
): void {
  assert.equal(
    v1.scooters.validatePlateForRegistrationType(
      registrationType,
      registrationNumber,
    ),
    null,
  );
}

function baseScooterInput(overrides: Record<string, unknown> = {}) {
  return {
    vin: "JYARN23E0RA123456",
    brandId: "brand-1",
    model: "NMAX",
    color: "White",
    manufactureYear: 2026,
    powertrainType: "combustion",
    engineDisplacementCc: 125,
    notes: null,
    ...overrides,
  };
}

function addDateOnlyDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("scooters can be recorded before their technical details are known", () => {
  const minimal = {
    vin: "JYARN23E0RA123456",
    brandId: "brand-1",
    powertrainType: "combustion",
  };
  assert.deepEqual(
    v1.scooters.createScooterInputSchema.parse(minimal),
    minimal,
  );
  const unknown = {
    model: null,
    manufactureYear: null,
    engineDisplacementCc: null,
    color: null,
  };
  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({ ...minimal, ...unknown })
      .success,
    true,
  );
  assert.deepEqual(
    v1.scooters.updateScooterInputSchema.parse(unknown),
    unknown,
  );
});

test("technical details accept explicit null, reject invalid quantities, and preserve omitted updates", () => {
  const fields = v1.scooters.scooterTechnicalDetailsSchema.shape;
  const cleared = Object.fromEntries(
    Object.keys(fields).map((key) => [key, null]),
  );
  assert.deepEqual(
    v1.scooters.updateScooterInputSchema.parse(cleared),
    cleared,
  );
  assert.deepEqual(
    v1.scooters.updateScooterInputSchema.parse({ notes: "Papers pending" }),
    { notes: "Papers pending" },
  );
  for (const input of [
    { seatsCount: -1 },
    { lengthMm: 2.5 },
    { ratedEngineRpm: 2_147_483_648 },
    { fuelTankCapacityLiters: -1 },
    { powerToWeightRatioKwKg: Infinity },
    { electricMotorPowerKw: NaN },
    { version: "v".repeat(121) },
  ]) {
    assert.equal(
      v1.scooters.updateScooterInputSchema.safeParse(input).success,
      false,
    );
  }
});

test("CIV enums reject arbitrary values and require custom text for other", () => {
  for (const field of v1.scooters.SCOOTER_CIV_FIELDS) {
    assert.equal(
      v1.scooters.updateScooterInputSchema.safeParse({
        [field]: "unknown-value",
      }).success,
      false,
    );
    assert.equal(
      v1.scooters.updateScooterInputSchema.safeParse({ [field]: "other" })
        .success,
      false,
    );
    assert.equal(
      v1.scooters.updateScooterInputSchema.safeParse({
        [field]: "other",
        [`${field}Other`]: "Exact CIV text",
      }).success,
      true,
    );
  }
});

test("propulsion rules allow hybrid and reject incompatible technical fields", () => {
  assert.equal(
    v1.scooters.updateScooterInputSchema.safeParse({
      powertrainType: "hybrid",
      engineDisplacementCc: 125,
      electricMotorPowerKw: 3.5,
    }).success,
    true,
  );
  assert.equal(
    v1.scooters.updateScooterInputSchema.safeParse({
      powertrainType: "combustion",
      electricMotorPowerKw: 3.5,
    }).success,
    false,
  );
  assert.equal(
    v1.scooters.updateScooterInputSchema.safeParse({
      powertrainType: "electric",
      fuelTankCapacityLiters: 5,
    }).success,
    false,
  );
  assert.deepEqual(
    v1.scooters.updateScooterInputSchema.parse({
      nationalRegistryNumber: " ab-001/c ",
    }),
    { nationalRegistryNumber: "AB-001/C" },
  );
});
