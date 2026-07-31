import { describe, expect, it } from "vitest";

import {
  financePeriodFromDateOnly,
  resolveFinancePeriod,
} from "../_lib/period";

describe("finance period", () => {
  it("turns the selected inclusive dates into a half-open API range", () => {
    expect(financePeriodFromDateOnly("2026-07-01", "2026-07-29")).toEqual({
      fromDate: "2026-07-01",
      toDate: "2026-07-29",
      query: {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-30T00:00:00.000Z",
      },
      usedFallback: false,
    });
  });

  it("falls back to the current month for invalid query input", () => {
    expect(
      resolveFinancePeriod(
        { from: "2026-02-31", to: "not-a-date" },
        new Date("2026-07-29T12:30:00.000Z"),
      ),
    ).toEqual({
      fromDate: "2026-07-01",
      toDate: "2026-07-29",
      query: {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-30T00:00:00.000Z",
      },
      usedFallback: true,
    });
  });

  it("rejects reversed and overlong ranges", () => {
    expect(financePeriodFromDateOnly("2026-07-02", "2026-07-01")).toBeNull();
    expect(financePeriodFromDateOnly("2025-01-01", "2026-07-01")).toBeNull();
  });
});
