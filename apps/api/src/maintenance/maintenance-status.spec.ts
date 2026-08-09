import {
  MAINTENANCE_DUE_SOON_DAYS,
  MAINTENANCE_DUE_SOON_KM,
  addCalendarMonthsClamped,
  calculateDefaultNextDueKm,
  calculateMaintenanceStatus,
  calculateNextDeadlines,
} from "./maintenance-status";

const NOW = new Date("2026-08-03T17:45:00.000Z");

describe("maintenance deadline calculation", () => {
  it("calculates the default mileage deadline", () => {
    expect(calculateDefaultNextDueKm(14_530, 3_000)).toBe(17_530);
    expect(calculateDefaultNextDueKm(14_530, null)).toBeNull();
  });

  it("calculates the default calendar deadline", () => {
    expect(
      addCalendarMonthsClamped(new Date("2026-08-03T00:00:00.000Z"), 6),
    ).toEqual(new Date("2027-02-03T00:00:00.000Z"));
  });

  it("clamps end-of-month dates without mutating the performed date", () => {
    const performedAt = new Date("2024-01-31T00:00:00.000Z");

    expect(addCalendarMonthsClamped(performedAt, 1)).toEqual(
      new Date("2024-02-29T00:00:00.000Z"),
    );
    expect(performedAt).toEqual(new Date("2024-01-31T00:00:00.000Z"));
  });

  it("gives manual deadlines priority over defaults", () => {
    const manualDate = new Date("2026-09-01T00:00:00.000Z");

    expect(
      calculateNextDeadlines({
        performedKm: 10_000,
        performedAt: new Date("2026-08-03T00:00:00.000Z"),
        intervalKm: 3_000,
        intervalMonths: 6,
        nextDueKm: 11_000,
        nextDueAt: manualDate,
      }),
    ).toEqual({
      nextDueKm: 11_000,
      nextDueAt: manualDate,
    });
  });

  it("allows an explicit null to suppress a default", () => {
    expect(
      calculateNextDeadlines({
        performedKm: 10_000,
        performedAt: new Date("2026-08-03T00:00:00.000Z"),
        intervalKm: 3_000,
        intervalMonths: 6,
        nextDueKm: null,
        nextDueAt: null,
      }),
    ).toEqual({ nextDueKm: null, nextDueAt: null });
  });
});

describe("maintenance status calculation", () => {
  it("returns UNKNOWN without a usable deadline", () => {
    expect(status({})).toBe("UNKNOWN");
    expect(status({ currentMileageKm: null, nextDueKm: 5_000 })).toBe(
      "UNKNOWN",
    );
  });

  it("returns OK when a deadline is not close", () => {
    expect(
      status({
        currentMileageKm: 5_000,
        nextDueKm: 5_000 + MAINTENANCE_DUE_SOON_KM + 1,
      }),
    ).toBe("OK");
    expect(
      status({
        nextDueAt: addUtcDays(NOW, MAINTENANCE_DUE_SOON_DAYS + 1),
      }),
    ).toBe("OK");
  });

  it("returns DUE_SOON at the mileage and day boundaries", () => {
    expect(
      status({
        currentMileageKm: 5_000,
        nextDueKm: 5_000 + MAINTENANCE_DUE_SOON_KM,
      }),
    ).toBe("DUE_SOON");
    expect(
      status({
        nextDueAt: addUtcDays(NOW, MAINTENANCE_DUE_SOON_DAYS),
      }),
    ).toBe("DUE_SOON");
  });

  it("returns OVERDUE when a mileage or date deadline is reached", () => {
    expect(status({ currentMileageKm: 5_000, nextDueKm: 5_000 })).toBe(
      "OVERDUE",
    );
    expect(status({ nextDueAt: new Date("2026-08-03T00:00:00.000Z") })).toBe(
      "OVERDUE",
    );
  });

  it("chooses the most urgent result across mileage and date", () => {
    expect(
      status({
        currentMileageKm: 5_000,
        nextDueKm: 7_000,
        nextDueAt: new Date("2026-08-02T00:00:00.000Z"),
      }),
    ).toBe("OVERDUE");
    expect(
      status({
        currentMileageKm: 5_000,
        nextDueKm: 5_100,
        nextDueAt: addUtcDays(NOW, 60),
      }),
    ).toBe("DUE_SOON");
  });

  it("uses the date branch when current mileage is unavailable", () => {
    expect(
      status({
        currentMileageKm: null,
        nextDueKm: 5_000,
        nextDueAt: addUtcDays(NOW, 10),
      }),
    ).toBe("DUE_SOON");
  });
});

function status(
  overrides: Partial<Parameters<typeof calculateMaintenanceStatus>[0]>,
) {
  return calculateMaintenanceStatus({
    currentMileageKm: null,
    nextDueKm: null,
    nextDueAt: null,
    now: NOW,
    ...overrides,
  });
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
