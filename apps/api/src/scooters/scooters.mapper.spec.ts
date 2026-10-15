import { toScooter } from "./scooters.mapper";

describe("scooter picker summaries", () => {
  const base = {
    id: "scooter",
    brand: { name: "KYMCO", code: "KYM" },
    createdAt: new Date("2026-10-14"),
    updatedAt: new Date("2026-10-14"),
  };
  it("keeps severity totals, cover and maintenance hold independent", () => {
    const result = toScooter({
      ...base,
      photos: [{ id: "cover" }],
      _count: { problems: 2 },
      problems: [
        { severity: "critical" },
        { severity: "critical" },
        { severity: "low" },
        { severity: null },
      ],
    } as unknown as Parameters<typeof toScooter>[0]);
    expect(result.problemSeverityCounts).toEqual({
      low: 1,
      moderate: 0,
      high: 0,
      critical: 2,
      unknown: 1,
    });
    expect(result.maintenanceHoldCount).toBe(2);
    expect(result.coverUrl).toContain("cover");
  });
  it("distinguishes an empty summary from one that was not loaded", () => {
    expect(
      toScooter({ ...base, problems: [] } as unknown as Parameters<
        typeof toScooter
      >[0]).problemSeverityCounts,
    ).toEqual({ low: 0, moderate: 0, high: 0, critical: 0, unknown: 0 });
    expect(
      toScooter(base as unknown as Parameters<typeof toScooter>[0])
        .problemSeverityCounts,
    ).toBeUndefined();
  });
});
