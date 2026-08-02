import { describe, expect, it } from "vitest";

import {
  financeUserLabel,
  formatFinanceDateTime,
  formatMoney,
  formatTransactionAmount,
} from "./finance-format";

describe("finance formatting", () => {
  it("formats values beyond Number.MAX_SAFE_INTEGER without losing digits", () => {
    expect(formatMoney("12345678901234567.89", "RON", "en")).toBe(
      "lei 12,345,678,901,234,567.89",
    );
  });

  it("preserves negative sub-unit balances", () => {
    expect(formatMoney("-0.50", "RON", "ro")).toContain("-0,50");
  });

  it("falls back without coercing invalid API values", () => {
    expect(formatMoney("unknown", "RON", "en")).toBe("unknown RON");
  });

  it("renders expense transactions as negative amounts", () => {
    expect(formatTransactionAmount("125.50", "RON", "ro", "EXPENSE")).toContain(
      "-125,50",
    );
    expect(
      formatTransactionAmount("125.50", "RON", "ro", "INCOME"),
    ).not.toContain("-");
  });

  it("uses a person's name when available and email otherwise", () => {
    expect(
      financeUserLabel({
        email: "ana@example.com",
        firstName: "Ana",
        lastName: "Pop",
      }),
    ).toBe("Ana Pop");
    expect(
      financeUserLabel({
        email: "ana@example.com",
        firstName: null,
        lastName: null,
      }),
    ).toBe("ana@example.com");
  });

  it("formats API instants using the requested locale", () => {
    expect(formatFinanceDateTime("2026-07-29T10:15:00.000Z", "en")).toContain(
      "29 Jul 2026",
    );
  });
});
