import { render, screen } from "@testing-library/react";
import { messages } from "@repo/i18n";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { DocumentReviewSummary } from "./DocumentReviewSummary";
import { createEmptyCreateForm } from "./form-state";
import type { CreatePersonDocumentFormState } from "./types";

function renderSummary(patch: Partial<CreatePersonDocumentFormState> = {}) {
  const document = {
    ...createEmptyCreateForm("romanian").documents[0]!,
    ...patch,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <DocumentReviewSummary document={document} locale="en" />
    </NextIntlClientProvider>,
  );
}

describe("document review summary", () => {
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
