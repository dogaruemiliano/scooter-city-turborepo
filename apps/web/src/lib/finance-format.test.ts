import { describe, expect, it } from "vitest";

import {
  financeUserLabel,
  formatBasisPoints,
  formatMinorAmount,
  formatSignedMinorAmount,
} from "./finance-format";

describe("formatMinorAmount", () => {
  it("renders minor units as major-unit currency", () => {
    expect(formatMinorAmount(30_000, "RON", "en")).toContain("300.00");
    expect(formatMinorAmount(30_005, "RON", "en")).toContain("300.05");
  });

  it("keeps both decimal places for whole amounts", () => {
    expect(formatMinorAmount(0, "RON", "en")).toContain("0.00");
  });

  it("uses the locale's own separators", () => {
    expect(formatMinorAmount(123_456, "RON", "ro")).toContain("1.234,56");
  });

  it.each(["en", "ro"] as const)(
    "uses the RON code instead of the localized lei symbol for %s",
    (locale) => {
      const formatted = formatMinorAmount(30_000, "RON", locale);

      expect(formatted).toContain("RON");
      expect(formatted.toLocaleLowerCase("ro-RO")).not.toContain("lei");
    },
  );
});

describe("formatSignedMinorAmount", () => {
  it("marks direction explicitly, since that is the point", () => {
    expect(formatSignedMinorAmount(30_000, "RON", "en")).toMatch(/^\+/);
    expect(formatSignedMinorAmount(-30_000, "RON", "en")).toMatch(/^−/);
  });

  it("leaves zero unsigned", () => {
    const formatted = formatSignedMinorAmount(0, "RON", "en");
    expect(formatted.startsWith("+")).toBe(false);
    expect(formatted.startsWith("−")).toBe(false);
  });

  it("keeps the RON code on signed amounts", () => {
    expect(formatSignedMinorAmount(-30_000, "RON", "ro")).toContain("RON");
  });
});

describe("formatBasisPoints", () => {
  it("renders ownership shares as percentages", () => {
    expect(formatBasisPoints(5_000, "en")).toBe("50%");
    expect(formatBasisPoints(10_000, "en")).toBe("100%");
    expect(formatBasisPoints(3_333, "en")).toBe("33.33%");
  });
});

describe("financeUserLabel", () => {
  it("prefers a name", () => {
    expect(
      financeUserLabel({
        email: "iusti@example.com",
        firstName: "Iusti",
        lastName: "Popa",
      }),
    ).toBe("Iusti Popa");
  });

  it("falls back to the email when no name is on record", () => {
    expect(
      financeUserLabel({
        email: "iusti@example.com",
        firstName: null,
        lastName: null,
      }),
    ).toBe("iusti@example.com");
  });
});
