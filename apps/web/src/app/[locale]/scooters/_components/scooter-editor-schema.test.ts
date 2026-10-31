import { parseDocumentImport } from "./scooter-document-import";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { describe, expect, it } from "vitest";
import {
  CREATE_FIELDS,
  SCOOTER_EDITOR_SECTIONS,
  insuranceEditorDefaults,
  scooterChangedFields,
  scooterCreateFormSchema,
  scooterEditFormSchema,
  scooterEditorDefaults,
  scooterRequiredFieldsValid,
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
  it("omits retired manual policy inputs from create and edit without replacing CIV speed", () => {
    const retired = {
      commercialCategory: "with_license",
      limiterKind: "LIMITED",
      limiterKmh: "45",
      maxSpeedSource: "Manual override",
      configurationEvidence: "Manual override",
      speedConfigurationChangeReason: "Manual override",
    };
    const values = { ...validValues(), ...retired, maxSpeedKmh: "60" };
    const created = scooterCreateFormSchema.parse(values);
    const edited = scooterEditFormSchema.parse({ ...values, fleetNumber: "7" });
    for (const field of Object.keys(retired)) {
      expect(CREATE_FIELDS).not.toContain(field);
      expect(scooterEditorDefaults()).not.toHaveProperty(field);
      expect(created).not.toHaveProperty(field);
      expect(edited).not.toHaveProperty(field);
    }
    expect(created.maxSpeedKmh).toBe(60);
    expect(edited.maxSpeedKmh).toBe(60);
  });

  it.each(v1.scooters.SCOOTER_REQUIRED_DRIVER_LICENSE_TYPES)(
    "preserves the selected application policy %s for an unregistered scooter",
    (requiredLicenseCategory) => {
      const values = { ...validValues(), requiredLicenseCategory };
      expect(
        scooterCreateFormSchema.parse(values).requiredLicenseCategory,
      ).toBe(requiredLicenseCategory);
      const input = scooterEditFormSchema.parse({
        ...values,
        fleetNumber: "7",
      });
      expect(
        scooterChangedFields(input, { requiredLicenseCategory: true }),
      ).toEqual({ requiredLicenseCategory });
    },
  );

  it("keeps commercial name out of the visible field sections", () => {
    const fields = SCOOTER_EDITOR_SECTIONS.flatMap((section) => [
      ...section.fields,
    ]);
    expect(fields).toContain("model");
    expect(fields).not.toContain("commercialName");
  });

  it("loads the commercial name into Model and falls back to legacy models", () => {
    for (const [commercialName, model, expected] of [
      ["NMAX 125", "Old model", "NMAX 125"],
      [null, "Legacy model", "Legacy model"],
      ["", "Legacy model", "Legacy model"],
    ]) {
      const values = scooterEditorDefaults({
        commercialName,
        model,
      } as v1.scooters.Scooter);
      expect(values.model).toBe(expected);
      expect(values.commercialName).toBe(expected);
    }
  });

  it.each([
    { commercialName: "NMAX 125" },
    { model: "NMAX 125" },
    { commercialName: "NMAX 125", model: "Old model" },
  ])("imports a single model value from documentary names: %j", (source) => {
    const result = parseDocumentImport(
      JSON.stringify(source),
      [],
      validValues(),
      false,
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.values).toMatchObject({
        model: "NMAX 125",
        commercialName: "NMAX 125",
      });
  });

  it("uses one Model input for the commercial name on create and edit", () => {
    const values = {
      ...validValues(),
      model: " NMAX 125 ",
      commercialName: "Old name",
    };
    expect(scooterCreateFormSchema.parse(values)).toMatchObject({
      model: "NMAX 125",
      commercialName: "NMAX 125",
    });
    const input = scooterEditFormSchema.parse({ ...values, fleetNumber: "7" });
    expect(scooterChangedFields(input, { model: true })).toEqual({
      model: "NMAX 125",
      commercialName: "NMAX 125",
    });
    expect(scooterChangedFields(input, { color: true })).not.toHaveProperty(
      "commercialName",
    );
    const cleared = scooterEditFormSchema.parse({
      ...values,
      fleetNumber: "7",
      model: "",
    });
    expect(scooterChangedFields(cleared, { model: true })).toEqual({
      model: null,
      commercialName: null,
    });
  });

  it("saves only changed phone equipment and preserves false versus unknown", () => {
    const input = scooterEditFormSchema.parse({
      ...validValues(),
      fleetNumber: "7",
      hasPhoneStand: "false",
      hasChargingOutlet: "",
    });
    expect(
      scooterChangedFields(input, {
        hasPhoneStand: true,
        hasChargingOutlet: true,
      }),
    ).toEqual({ hasPhoneStand: false, hasChargingOutlet: null });
  });

  it("converts fuel systems and clears them when switching to electric", () => {
    expect(
      scooterCreateFormSchema.parse({
        ...validValues(),
        fuelSystem: "injection",
      }).fuelSystem,
    ).toBe("injection");
    expect(scooterCreateFormSchema.parse(validValues()).fuelSystem).toBeNull();
    const input = scooterEditFormSchema.parse({
      ...validValues(),
      fleetNumber: "7",
      powertrainType: "electric",
      fuelSystem: "carburetor",
    });
    expect(
      scooterChangedFields(input, { powertrainType: true }).fuelSystem,
    ).toBeNull();
  });

  it("validates edited internal numbers and only submits them when changed", () => {
    const input = scooterEditFormSchema.parse({
      ...validValues(),
      fleetNumber: "042",
    });
    expect(input.fleetNumber).toBe(42);
    expect(scooterChangedFields(input, { fleetNumber: true })).toEqual({
      fleetNumber: 42,
    });
    expect(scooterChangedFields(input, {})).not.toHaveProperty("fleetNumber");
    for (const fleetNumber of ["", "0", "-1", "1.5", "2147483648", null])
      expect(
        scooterEditFormSchema.safeParse({ ...validValues(), fleetNumber })
          .success,
      ).toBe(false);
  });

  it("omits automatic numbering and validates manual overrides", () => {
    expect(scooterCreateFormSchema.parse(validValues())).not.toHaveProperty(
      "fleetNumber",
    );
    expect(
      scooterCreateFormSchema.parse({ ...validValues(), fleetNumber: "007" })
        .fleetNumber,
    ).toBe(7);
    for (const fleetNumber of [
      "",
      " ",
      "-1",
      "0",
      "1.2",
      "2e2",
      "2147483648",
      "abc",
    ]) {
      const result = scooterCreateFormSchema.safeParse({
        ...validValues(),
        fleetNumber,
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(
          result.error.issues.some((issue) => issue.path[0] === "fleetNumber"),
        ).toBe(true);
    }
  });
  it("defaults insurance currency to RON", () => {
    const policy: v1.scooters.InsurancePolicyInput = {
      id: "policy-1",
      insuredName: null,
      validFrom: null,
      validUntil: null,
      premiumAmount: null,
      currency: "",
      documentVin: null,
      vinReviewConfirmed: false,
    };
    expect(insuranceEditorDefaults().currency).toBe("RON");
    expect(insuranceEditorDefaults(policy).currency).toBe("RON");
    expect(
      insuranceEditorDefaults({ ...policy, currency: "EUR" }).currency,
    ).toBe("EUR");
  });

  it("omits the empty visible insurance placeholder from creation", () => {
    const input = scooterCreateFormSchema.parse({
      ...validValues(),
      insurancePolicies: [insuranceEditorDefaults()],
    });
    expect(input.insurancePolicies).toEqual([]);
  });

  it("accepts manual insurance without a VIN checkbox and skips empty evidence placeholders", () => {
    const manual = scooterCreateFormSchema.parse({
      ...validValues(),
      insurancePolicies: [
        { ...insuranceEditorDefaults(), insuredName: "ScooterCity" },
      ],
    });
    expect(manual.insurancePolicies).toHaveLength(1);
    const empty = scooterCreateFormSchema.parse({
      ...validValues(),
      insurancePolicies: [
        { ...insuranceEditorDefaults(), sourceFileNames: ["insurance.pdf"] },
      ],
    });
    expect(empty.insurancePolicies).toEqual([]);
  });
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
              "fleetNumber",
              "propulsionSystem",
              "documentDrafts",
              "photoDrafts",
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
      hasPhoneStand: "true",
      hasChargingOutlet: "false",
      odometerWorking: "true",
      speedometerWorking: "",
      currentMileageKm: "0",
      actualMaxSpeedKmh: "45",
      maxSpeedKmh: "25",
    });
    expect(input).toMatchObject({
      hasGps: false,
      hasPhoneStand: true,
      hasChargingOutlet: false,
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
    expect(defaults.powertrainType).toBe("combustion");
    expect(defaults.vehicleCategory).toBe("L1e");
    expect(defaults.registrationType).toBe("");
    expect(defaults.requiredLicenseCategory).toBe("none");
    expect(defaults.hasGps).toBe("");
    expect(defaults.hasPhoneStand).toBe("");
    expect(defaults.hasChargingOutlet).toBe("");
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
      fleetNumber: "7",
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
      fleetNumber: "7",
      color: "",
      powerKw: "8,5",
      registrationType: "temporary",
      registrationNumber: "CJ0123",
      registrationDate: "2025-01-01",
    });
    expect(
      scooterChangedFields(input, {
        color: true,
        powerKw: true,
      }),
    ).toEqual({ color: null, powerKw: 8.5 });
    expect(input.registrationType).toBe("temporary");
    expect(input.registrationNumber).toBe("CJ0123");
  });

  it("excludes hidden drafts from validation and clears only on a propulsion change", () => {
    const input = scooterEditFormSchema.parse({
      ...validValues(),
      fleetNumber: "7",
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

  it.each([
    ["national", "CJ 12 ABC"],
    ["local", "14947"],
    ["temporary", "CJ 0123"],
  ])(
    "requires only a plate for %s registration",
    (registrationType, registrationNumber) => {
      const values = {
        ...validValues(),
        registrationType,
        registrationNumber,
        requiredLicenseCategory: "",
      };
      expect(scooterCreateFormSchema.safeParse(values).success).toBe(true);
      expect(
        scooterCreateFormSchema.safeParse({ ...values, registrationNumber: "" })
          .success,
      ).toBe(false);
    },
  );

  it("normalizes plates and validates registration dates", () => {
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
      { registrationDate: "2025-02-30" },
    ]) {
      expect(
        scooterCreateFormSchema.safeParse({ ...values, ...change }).success,
      ).toBe(false);
    }
  });
});

describe("required fields for create actions", () => {
  it("accepts valid required fields independently of optional draft errors", () => {
    expect(
      scooterRequiredFieldsValid({
        ...validValues(),
        manufactureYear: "invalid",
        currentMileageKm: "-1",
      }),
    ).toBe(true);
  });
  it.each(["vin", "brandId", "powertrainType", "registrationType"] as const)(
    "rejects missing %s",
    (field) => {
      expect(
        scooterRequiredFieldsValid({ ...validValues(), [field]: "" }),
      ).toBe(false);
    },
  );
  it("requires a valid plate when a registered type is selected", () => {
    const values = { ...validValues(), registrationType: "national" };
    expect(scooterRequiredFieldsValid(values)).toBe(false);
    expect(
      scooterRequiredFieldsValid({ ...values, registrationNumber: "INVALID" }),
    ).toBe(false);
    expect(
      scooterRequiredFieldsValid({
        ...values,
        registrationNumber: "CJ 12 ABC",
      }),
    ).toBe(true);
  });
});

it("creates unregistered scooters before CIV issue and supports issued CIV without a scan", () => {
  expect(
    scooterCreateFormSchema.parse({
      ...validValues(),
      civAvailability: "not_issued",
    }).civAvailability,
  ).toBe("not_issued");
  expect(
    scooterCreateFormSchema.parse({
      ...validValues(),
      civAvailability: "issued",
    }).civAvailability,
  ).toBe("issued");
  expect(
    scooterCreateFormSchema.safeParse({
      ...validValues(),
      civAvailability: "not_issued",
      civNumber: "CIV-123",
    }).success,
  ).toBe(false);
});
