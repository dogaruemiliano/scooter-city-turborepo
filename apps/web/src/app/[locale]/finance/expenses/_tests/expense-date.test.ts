import { describe, expect, it } from "vitest";

import { expenseToday } from "../_lib/expense-date";

describe("expenseToday", () => {
  it("uses the Bucharest business date instead of the UTC date", () => {
    expect(expenseToday(new Date("2026-01-01T22:30:00.000Z"))).toBe(
      "2026-01-02",
    );
  });

  it("respects the business timezone during daylight-saving time", () => {
    expect(expenseToday(new Date("2026-07-01T21:30:00.000Z"))).toBe(
      "2026-07-02",
    );
  });
});
