import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { describe, expect, it } from "vitest";
import {
  CREATE_FIELDS,
  scooterChangedFields,
  scooterCreateFormSchema,
  scooterEditFormSchema,
  scooterEditorDefaults,
} from "./scooter-editor-schema";

const validValues = () => ({
  ...scooterEditorDefaults(),
  vin: "jyarn23e0ra123456",
  brandId: "brand-1",
  powertrainType: "combustion",
  registrationType: "unregistered",
  requiredLicenseCategory: "none",
});

describe("scooter editor conversion", () => {
  it("has localized labels for every form field in English and Romanian", () => {
    for (const locale of ["en", "ro"] as const)
      for (const field of CREATE_FIELDS) {
        expect(messages[locale].scooters.fields).toHaveProperty(
          field === "brandId" ? "brand" : field,
        );
      }
  });
  it("covers every editable scalar API field", () => {
    expect([...CREATE_FIELDS].sort()).toEqual(
      Object.keys(v1.scooters.createScooterInputSchema.shape)
        .filter(
          (field) =>
            ![
              "propulsionSystem",
              "documentDrafts",
              "sessionId",
              "civRawFields",
              "insurancePolicies",
            ].includes(field),
        )
        .sort(),
    );
  });

  it("normalizes CIV dashes to null and retains zero and decimal precision", () => {
    const input = scooterCreateFormSchema.parse({
      ...validValues(),
      maxAxle3MassKg: "-",
      standingCapacity: "0",
      stationaryNoiseDb: "82,125",
      civVersion: "2024",
    });
    expect(input).toMatchObject({
      maxAxle3MassKg: null,
      standingCapacity: 0,
      stationaryNoiseDb: 82.125,
      civVersion: "2024",
    });
  });

  it("preserves unknown values, zero, and decimal precision", () => {
    const input = scooterCreateFormSchema.parse({
      ...validValues(),
      currentMileageKm: "0",
      seatsCount: "0",
      powerKw: "8,125",
      powerToWeightRatioKwKg: "0.012345",
      model: "  ",
    });
    expect(input).toMatchObject({
      vin: "JYARN23E0RA123456",
      currentMileageKm: 0,
      seatsCount: 0,
      powerKw: 8.125,
      powerToWeightRatioKwKg: 0.012345,
      engineDisplacementCc: null,
      model: null,
    });
  });

  it("keeps operational yes, no and unchecked distinct from documentary values", () => {
    const input = scooterCreateFormSchema.parse({
      ...validValues(),
      hasGps: "false",
      odometerWorking: "true",
      speedometerWorking: "",
      currentMileageKm: "0",
      actualMaxSpeedKmh: "45",
      maxSpeedKmh: "25",
    });
    expect(input).toMatchObject({
      hasGps: false,
      odometerWorking: true,
      speedometerWorking: null,
      currentMileageKm: 0,
      actualMaxSpeedKmh: 45,
      maxSpeedKmh: 25,
    });
    expect(
      scooterCreateFormSchema.safeParse({ ...validValues(), hasGps: "yes" })
        .success,
    ).toBe(false);
  });

  it("does not assume registration or operational status for a new scooter", () => {
    const defaults = scooterEditorDefaults();
    expect(defaults.registrationType).toBe("");
    expect(defaults.requiredLicenseCategory).toBe("");
    expect(defaults.hasGps).toBe("");
    expect(defaults.odometerWorking).toBe("");
    expect(defaults.speedometerWorking).toBe("");
    expect(
      scooterCreateFormSchema.safeParse({
        ...validValues(),
        registrationType: "",
      }).success,
    ).toBe(false);
  });

  it("edits operational checks without clearing technical speed or replacing no with unknown", () => {
    const input = scooterEditFormSchema.parse({
      ...validValues(),
      hasGps: "false",
      odometerWorking: "",
      actualMaxSpeedKmh: "0",
      maxSpeedKmh: "25",
    });
    expect(
      scooterChangedFields(input, {
        hasGps: true,
        odometerWorking: true,
        actualMaxSpeedKmh: true,
      }),
    ).toEqual({
      hasGps: false,
      odometerWorking: null,
      actualMaxSpeedKmh: 0,
    });
  });

  it.each(["12abc", "1,2.3", "1 000", "1e2", "Infinity", "NaN", "1.2.3"])(
    "rejects malformed numbers: %s",
    (value) => {
      expect(
        scooterCreateFormSchema.safeParse({ ...validValues(), powerKw: value })
          .success,
      ).toBe(false);
    },
  );

  it.each(["1.5", "-1", "2147483648"])(
    "rejects invalid technical integers: %s",
    (value) => {
      expect(
        scooterCreateFormSchema.safeParse({ ...validValues(), lengthMm: value })
          .success,
      ).toBe(false);
    },
  );

  it("validates full edit values but sends only deliberate changes", () => {
    const input = scooterEditFormSchema.parse({
      ...validValues(),
      color: "",
      powerKw: "8,5",
      registrationType: "temporary",
      registrationNumber: "INVALID",
      registrationDate: "2099-01-01",
    });
    expect(
      scooterChangedFields(input, {
        color: true,
        powerKw: true,
        registrationType: true,
      }),
    ).toEqual({ color: null, powerKw: 8.5 });
    expect(input).not.toHaveProperty("registrationType");
    expect(input).not.toHaveProperty("registrationNumber");
  });

  it("excludes hidden drafts from validation and clears only on a propulsion change", () => {
    const input = scooterEditFormSchema.parse({
      ...validValues(),
      powertrainType: "electric",
      engineDisplacementCc: "invalid hidden draft",
      fuelTankCapacityLiters: "5",
    });
    expect(input.engineDisplacementCc).toBeNull();
    expect(scooterChangedFields(input, { notes: true })).not.toHaveProperty(
      "engineDisplacementCc",
    );
    expect(scooterChangedFields(input, { powertrainType: true })).toMatchObject(
      {
        powertrainType: "electric",
        engineDisplacementCc: null,
        fuelTankCapacityLiters: null,
        fuelType: "electric",
      },
    );
  });

  it("supports both hybrid power fields and uppercase registry numbers", () => {
    const input = scooterCreateFormSchema.parse({
      ...validValues(),
      powertrainType: "hybrid",
      powerKw: "8.5",
      electricMotorPowerKw: "3,25",
      nationalRegistryNumber: " ab-001/c ",
    });
    expect(input).toMatchObject({
      powerKw: 8.5,
      electricMotorPowerKw: 3.25,
      nationalRegistryNumber: "AB-001/C",
    });
  });

  it("normalizes plates and validates registration dates and explicit license selection", () => {
    const values = {
      ...validValues(),
      registrationType: "temporary",
      registrationNumber: "cj0123",
      registrationDate: "2025-06-01",
      temporaryRegistrationExpiresAt: "2025-06-01",
      requiredLicenseCategory: "AM",
    };
    expect(scooterCreateFormSchema.parse(values).registrationNumber).toBe(
      "CJ 0123",
    );
    for (const change of [
      { registrationDate: "2099-01-01" },
      { temporaryRegistrationExpiresAt: "2025-05-31" },
      { requiredLicenseCategory: "" },
      { registrationDate: "2025-02-30" },
    ]) {
      expect(
        scooterCreateFormSchema.safeParse({ ...values, ...change }).success,
      ).toBe(false);
    }
  });
});
