import { render, screen } from "@testing-library/react";
import { messages } from "@repo/i18n";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentReviewSummary } from "./DocumentReviewSummary";
import { createEmptyCreateForm } from "./form-state";
import type { CreatePersonDocumentFormState } from "./types";

function renderSummary(
  patch: Partial<CreatePersonDocumentFormState> = {},
  compact = false,
) {
  const document = {
    ...createEmptyCreateForm("romanian").documents[0]!,
    ...patch,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <DocumentReviewSummary
        document={document}
        locale="en"
        compact={compact}
      />
    </NextIntlClientProvider>,
  );
}

describe("document review summary", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps Romanian card previews to the identifier and expiry", () => {
    renderSummary({ series: "RX", number: "123456" }, true);
    expect(screen.getByText("RX 123456")).toBeVisible();
    expect(screen.queryByText("Issued on")).toBeNull();
    expect(screen.getByText("Expires on")).toBeVisible();
  });

  it("shows only the number for an electronic Romanian ID", () => {
    renderSummary(
      { nationalIdFormat: "electronic", series: "OLD", number: "AB123456" },
      true,
    );
    expect(screen.getByText("AB123456")).toBeVisible();
    expect(screen.queryByText("OLD")).toBeNull();
    expect(screen.queryByText("Issued on")).toBeNull();
  });

  it.each([
    [-1, "text-destructive"],
    [0, "text-destructive"],
    [6, "text-destructive"],
    [7, "text-warning"],
    [30, "text-warning"],
    [31, "text-foreground"],
  ])("styles an expiry %i calendar days away with %s", (days, color) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 12, 23, 59));
    const expiry = new Date(2026, 8, 12 + days);
    renderSummary(
      {
        hasExpiryDate: true,
        expiresOn: {
          day: String(expiry.getDate()),
          month: String(expiry.getMonth() + 1),
          year: String(expiry.getFullYear()),
        },
      },
      true,
    );
    expect(screen.getByText("Expires on").nextElementSibling).toHaveClass(
      color,
    );
  });

  it("does not flag documents with no expiry date", () => {
    renderSummary(
      {
        hasExpiryDate: false,
        expiresOn: { day: "1", month: "1", year: "2020" },
      },
      true,
    );
    expect(screen.getByText("No expiration date")).not.toHaveClass(
      "text-destructive",
      "text-warning",
    );
  });

  it.each(["nationalId", "passport"] as const)(
    "shows a single ID number for %s without a separate series",
    (type) => {
      renderSummary({
        type,
        nationalIdFormat: "electronic",
        series: "OLD",
        number: "AB123456",
      });
      expect(screen.getByText("ID number")).toBeVisible();
      expect(screen.getByText("AB123456")).toBeVisible();
      expect(screen.queryByText("Series")).not.toBeInTheDocument();
      expect(screen.getByText("Issued on")).toBeVisible();
      expect(screen.getByText("Expires on")).toBeVisible();
    },
  );
  it("marks missing values and incomplete dates without inventing dates", () => {
    renderSummary({
      issuedOn: { day: "15", month: "", year: "" },
      hasExpiryDate: true,
    });
    expect(screen.getByText("Check date")).toBeVisible();
    expect(screen.getAllByText("Not provided")).toHaveLength(3);
  });
  it("distinguishes documents without expiry from a missing expiry date", () => {
    renderSummary({ hasExpiryDate: false });
    expect(screen.getByText("No expiration date")).toBeVisible();
  });
});
