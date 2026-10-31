import { v1 } from "@repo/api-shared";
import {
  prefillRentalInspection,
  inspectionScooterChanges,
  inspectionHasCriticalFinding,
} from "./rental-inspection";

describe("Rental commercial policy", () => {
  it("fails closed for unknown or minor participants at the actual contractual day", () => {
    expect(
      v1.rentals.rentalAdultPolicyEligible(
        null,
        new Date("2026-10-30T12:00:00Z"),
      ),
    ).toBe(false);
    expect(
      v1.rentals.rentalAdultPolicyEligible(
        "2010-01-01",
        new Date("2026-10-30T12:00:00Z"),
      ),
    ).toBe(false);
    expect(
      v1.rentals.rentalAdultPolicyEligible(
        "2008-10-31",
        new Date("2026-10-30T12:00:00Z"),
      ),
    ).toBe(false);
    expect(
      v1.rentals.rentalAdultPolicyEligible(
        "2008-10-30",
        new Date("2026-10-30T12:00:00Z"),
      ),
    ).toBe(true);
  });
  it.each([
    ["without_license", "standard", 30_000, 60_000, 7],
    ["with_license", "standard", 25_000, 55_000, 7],
    ["without_license", "three_plus_one", 30_000, 120_000, 28],
    ["with_license", "three_plus_one", 25_000, 105_000, 28],
  ] as const)(
    "calculates %s %s entirely in bani",
    (category, promotion, weekly, initial, days) => {
      const terms = v1.rentals.calculateRentalTerms(
        category,
        promotion,
        "card",
        "transfer",
      );
      expect(terms).toMatchObject({
        weeklyRateMinor: weekly,
        depositMinor: 30_000,
        initialTotalMinor: initial,
        initialCoverageDays: days,
        rentalPaymentMethod: "card",
        depositPaymentMethod: "transfer",
        agreementMonths: 24,
        noticeDays: 7,
      });
    },
  );

  it("rejects manipulated browser monetary fields", () => {
    expect(
      v1.rentals.createRentalInputSchema.safeParse({
        personId: "p",
        scooterId: "s",
        startsAt: "2026-10-30T10:00:00.000Z",
        endsAt: "2026-11-01T10:00:00.000Z",
        initialTotalMinor: 1,
      }).success,
    ).toBe(false);
  });

  it.each([
    ["2026-03-27T10:00:00.000Z", 7, "2026-04-03T09:00:00.000Z"],
    ["2026-10-23T09:00:00.000Z", 7, "2026-10-30T10:00:00.000Z"],
    ["2026-10-01T09:00:00.000Z", 28, "2026-10-29T10:00:00.000Z"],
  ])("adds Bucharest calendar days across DST", (start, days, expected) => {
    expect(
      v1.rentals.addRentalCalendar(new Date(start), Number(days)).toISOString(),
    ).toBe(expected);
  });

  it("clamps leap-day monthly agreement expiry", () => {
    expect(
      v1.rentals
        .addRentalCalendar(new Date("2024-02-29T10:00:00.000Z"), 0, 24)
        .toISOString(),
    ).toBe("2026-02-28T10:00:00.000Z");
  });
  it.each([
    ["2026-03-29", "2026-03-28T22:00:00.000Z"],
    ["2026-10-25", "2026-10-24T21:00:00.000Z"],
    ["2026-10-30", "2026-10-29T22:00:00.000Z"],
  ])("resolves Bucharest midnight for %s", (day, expected) => {
    expect(v1.rentals.rentalDateStart(day).toISOString()).toBe(expected);
  });
});

describe("Rental inspection preserves evidence", () => {
  const initial = () =>
    prefillRentalInspection({
      currentMileageKm: 14_123,
      hasPhoneStand: false,
      hasChargingOutlet: null,
      requiredLicenseCategory: "A",
    });
  it("prefills known mileage and equipment without inventing control verification", () => {
    expect(initial()).toMatchObject({
      odometerDisplayedKm: 14_123,
      odometer: "not_checked",
      speedometer: "not_checked",
      phoneStand: { presence: "absent", condition: "not_applicable" },
      chargingOutlet: { presence: "unknown", condition: "not_checked" },
      limiterCheck: "not_applicable",
    });
    expect(v1.rentals.inspectionReadinessIssues(initial(), null)).toContain(
      "inspection.brakes",
    );
    expect(inspectionHasCriticalFinding(initial())).toBe(false);
  });
  it.each([null, 123])(
    "does not replace known mileage from a defective odometer displaying %s",
    (displayed) => {
      const data = {
        ...initial(),
        odometer: "defect" as const,
        odometerDisplayedKm: displayed,
      };
      expect(inspectionScooterChanges(data)).not.toHaveProperty(
        "currentMileageKm",
      );
      expect(inspectionScooterChanges(data).odometerWorking).toBe(false);
    },
  );
  it("updates a checked working odometer and preserves absent accessories", () => {
    expect(
      inspectionScooterChanges({
        ...initial(),
        odometer: "ok",
        odometerDisplayedKm: 14_124,
      }),
    ).toMatchObject({
      currentMileageKm: 14_124,
      odometerWorking: true,
      hasPhoneStand: false,
    });
  });
  it("prefills explicitly recorded instrument states while preserving unknown values", () => {
    expect(
      prefillRentalInspection({
        currentMileageKm: 100,
        hasPhoneStand: true,
        hasChargingOutlet: false,
        requiredLicenseCategory: "AM",
        odometerWorking: false,
        speedometerWorking: true,
      }),
    ).toMatchObject({
      odometer: "defect",
      speedometer: "ok",
      phoneStand: { presence: "present", condition: "not_checked" },
    });
  });
  it("distinguishes unsafe findings from unchecked controls", () => {
    expect(
      inspectionHasCriticalFinding({ ...initial(), brakes: "defect" }),
    ).toBe(true);
    expect(
      inspectionHasCriticalFinding({
        ...initial(),
        criticalDefect: "Damaged frame",
      }),
    ).toBe(true);
  });
  it("requires inspection evidence for the application cap without inventing physical equipment", () => {
    const data = initial();
    expect(v1.rentals.inspectionReadinessIssues(data, 25)).toContain(
      "inspection.limiter",
    );
    expect(
      v1.rentals.inspectionReadinessIssues(
        { ...data, limiterCheck: "ok" },
        null,
      ),
    ).not.toContain("inspection.limiter");
    expect(
      v1.rentals.inspectionReadinessIssues(
        { ...data, observedSpeedKmh: 26 },
        25,
      ),
    ).toContain("inspection.limiterExceeded");
  });
  it.each(["none", "AM"] as const)(
    "enforces the exact %s application-cap boundary",
    (category) => {
      const cap = v1.scooters.licenceSpeedLimitKmh(category)!;
      const data = {
        ...initial(),
        limiterCheck: "ok" as const,
        speedVerificationMethod: "Synthetic measured speed test",
        observedSpeedKmh: cap,
      };
      expect(v1.rentals.inspectionReadinessIssues(data, cap)).not.toContain(
        "inspection.limiterExceeded",
      );
      expect(
        v1.rentals.inspectionReadinessIssues(
          { ...data, observedSpeedKmh: cap + 1 },
          cap,
        ),
      ).toContain("inspection.limiterExceeded");
    },
  );
});

describe("Scooter speed configuration", () => {
  const known = {
    maxSpeedKmh: 55,
    maxSpeedSource: "CIV",
    configurationEvidence: "Service evidence",
  };
  it.each([25, 45] as const)(
    "accepts documented %s km/h limiter",
    (limiterKmh) => {
      expect(
        v1.scooters.scooterSpeedConfigurationSchema.safeParse({
          ...known,
          limiterKind: "LIMITED",
          limiterKmh,
        }).success,
      ).toBe(true);
    },
  );
  it("requires evidence of the absence of a limiter", () => {
    expect(
      v1.scooters.scooterSpeedConfigurationSchema.safeParse({
        ...known,
        limiterKind: "NO_LIMITER",
        limiterKmh: null,
      }).success,
    ).toBe(true);
    expect(
      v1.scooters.scooterSpeedConfigurationSchema.safeParse({
        ...known,
        limiterKind: "NO_LIMITER",
        limiterKmh: 25,
      }).success,
    ).toBe(false);
  });
  it("rejects contradictions between constructive and limiter speeds", () => {
    expect(
      v1.scooters.scooterSpeedConfigurationSchema.safeParse({
        ...known,
        maxSpeedKmh: 25,
        limiterKind: "LIMITED",
        limiterKmh: 45,
      }).success,
    ).toBe(false);
  });
});
