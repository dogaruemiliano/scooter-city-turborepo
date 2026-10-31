import assert from "node:assert/strict";
import test from "node:test";
import { v1 } from "../src";
const { vehicleCiv: civ, scooters } = v1;

test("reextraction saves accumulated original CIV fields without dropping earlier labels", () => {
  const previous = Object.fromEntries(
    Array.from({ length: 53 }, (_, i) => [`old-label-${i}`, `old value ${i}`]),
  );
  const incoming = Object.fromEntries(
    Array.from({ length: 60 }, (_, i) => [`new-label-${i}`, `new value ${i}`]),
  );
  const civRawFields = { ...previous, ...incoming };
  assert.equal(Object.keys(civRawFields).length, 113);
  const payload = { civIssuedAt: "2026-08-21", civRawFields };
  const result = scooters.updateScooterInputSchema.parse(payload);
  assert.deepEqual(result.civRawFields, civRawFields);
  assert.equal(result.civIssuedAt, "2026-08-21");
  assert.ok(
    scooters.scooterSchema.shape.civRawFields.safeParse(civRawFields).success,
  );
});

test("accumulated CIV metadata still bounds count, keys and text lengths", () => {
  const raw = Object.fromEntries(
    Array.from({ length: civ.CIV_RAW_FIELDS_MAX }, (_, i) => [
      `label-${i}`,
      "value",
    ]),
  );
  assert.ok(civ.civRawFieldsSchema.safeParse(raw).success);
  assert.equal(
    civ.civRawFieldsSchema.safeParse({ ...raw, extra: "value" }).success,
    false,
  );
  assert.equal(
    civ.civRawFieldsSchema.safeParse({ ["a".repeat(121)]: "value" }).success,
    false,
  );
  assert.equal(
    civ.civRawFieldsSchema.safeParse({ label: "a".repeat(2001) }).success,
    false,
  );
});

test("CIV 2024 and 2016 codes follow their own layouts", () => {
  const examples = [
    ["manufactureYear", "1", "2"],
    ["nationalCategory", "2", "3"],
    ["vehicleClass", "3", "4"],
    ["bodyType", "4", "5"],
    ["lengthMm", "9", "10"],
    ["widthMm", "10", "11"],
    ["heightMm", "11", "12"],
    ["engineCode", "13", "14"],
    ["propulsionSystem", "14", "15"],
    ["electricMotorPowerKw", "15", "16"],
    ["nationalEmissionsCode", "16", "17"],
    ["driveType", "17", "18"],
    ["frontSuspension", "19.1", "20.1"],
  ];
  for (const [field, code2024, code2016] of examples) {
    assert.equal(civ.civFieldHint("2024", field!), code2024);
    assert.equal(civ.civFieldHint("2016", field!), code2016);
  }
  for (const version of ["2024", "2016"] as const) {
    assert.equal(civ.civFieldHint(version, "powerKw"), "P.2");
    assert.equal(civ.civFieldHint(version, "maxAxle5MassKg"), "N.5");
  }
});

test("unknown and ambiguous historical codes are never guessed", () => {
  assert.equal(civ.civFieldHint("unknown", "vin"), undefined);
  assert.equal(civ.civFieldHint("1993", "vehicleCategory"), undefined);
  assert.equal(civ.civFieldHint("1993", "maxAxle2MassKg"), undefined);
  assert.equal(civ.civFieldHint("2016", "nationalRegistryNumber"), undefined);
  assert.equal(civ.resolveCivField("1993", "10"), undefined);
  assert.equal(civ.resolveCivField("1993", "10", "Tipul"), "engineCode");
  assert.equal(civ.resolveCivField("2024", "13"), "engineCode");
  assert.equal(civ.resolveCivField("2016", "13"), "wheelbaseMm");
  assert.equal(civ.resolveCivField("unknown", "E"), undefined);
  assert.equal(civ.civFieldHint("1993", "vin"), "6");
});

test("CIV numbers preserve missing values and accept dot/comma decimals", () => {
  for (const value of ["", " ", "-", " - "])
    assert.equal(civ.parseCivNumber(value), null);
  assert.equal(civ.parseCivNumber("0"), 0);
  assert.equal(civ.parseCivNumber("82,125"), 82.125);
  assert.equal(civ.parseCivNumber("82.125"), 82.125);
  for (const value of ["-1", "1e3", "1.234,5", "unknown"])
    assert.ok(Number.isNaN(civ.parseCivNumber(value)));
});

test("CIV data supports cars, buses, heavy axles, unpowered trailers and literal source text", () => {
  const base = {
    vin: "LXYTCKP05P0000001",
    brandId: "brand",
    powertrainType: "combustion",
  };
  const value = scooters.createScooterInputSchema.parse({
    ...base,
    vehicleCategory: "M3",
    vehicleClass: "III",
    engineDisplacementCc: 12800,
    powerKw: 350.125,
    maxAxle5MassKg: 8000,
    co2EmissionsGKm: 150.75,
    standingCapacity: 0,
    civVersion: "1993",
    civRawFields: { "10": "original grouped text", unmapped: "-" },
  });
  assert.equal(value.powerKw, 350.125);
  assert.equal(value.civRawFields?.unmapped, "-");
  assert.ok(
    scooters.createScooterInputSchema.safeParse({
      ...base,
      vehicleCategory: "O2",
      powertrainType: "unpowered",
      engineDisplacementCc: null,
      powerKw: null,
    }).success,
  );
  assert.equal(
    scooters.createScooterInputSchema.safeParse({
      ...base,
      powertrainType: "unpowered",
      powerKw: 2,
    }).success,
    false,
  );
});

test("new CIV fields are nullable and reject invalid numbers and metadata", () => {
  for (const field of Object.keys(
    civ.civAdditionalSpecificationsSchema.shape,
  )) {
    assert.ok(
      scooters.updateScooterInputSchema.safeParse({ [field]: null }).success,
    );
  }
  for (const invalid of [
    { maxAxle3MassKg: -1 },
    { standingCapacity: 2.5 },
    { stationaryNoiseDb: -1 },
    { civVersion: "2020" },
    { civIssuedAt: "2999-01-01" },
    { civRawFields: { x: 0 } },
  ]) {
    assert.equal(
      scooters.updateScooterInputSchema.safeParse(invalid).success,
      false,
    );
  }
  assert.deepEqual(
    scooters.updateScooterInputSchema.parse({ notes: "Operational note" }),
    { notes: "Operational note" },
  );
  assert.deepEqual(
    scooters.updateScooterInputSchema.parse({ civRawFields: null }),
    { civRawFields: null },
  );
});
