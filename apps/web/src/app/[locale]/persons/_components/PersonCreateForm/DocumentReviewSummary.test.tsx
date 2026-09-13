import { render, screen } from "@testing-library/react";
import { messages } from "@repo/i18n";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentReviewSummary } from "./DocumentReviewSummary";
import { createEmptyCreateForm } from "./form-state";
import type { CreatePersonDocumentFormState } from "./types";

function renderSummary(patch: Partial<CreatePersonDocumentFormState> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <DocumentReviewSummary
        document={{
          ...createEmptyCreateForm("romanian").documents[0]!,
          ...patch,
        }}
        locale="en"
      />
    </NextIntlClientProvider>,
  );
}

describe("document review summary", () => {
  afterEach(() => vi.useRealTimers());
  it("shows the type and identifier without redundant status labels", () => {
    renderSummary({ series: "RX", number: "123456" });
    expect(screen.getByText("National ID")).toBeVisible();
    expect(screen.getByText("RX 123456")).toBeVisible();
    for (const label of [
      "Required",
      "Verified",
      "Details added",
      "Issued on",
      "Series",
    ])
      expect(screen.queryByText(label)).toBeNull();
  });
  it.each(["nationalId", "passport"] as const)(
    "shows only the number for %s without a series",
    (type) => {
      renderSummary({
        type,
        nationalIdFormat: "electronic",
        series: "OLD",
        number: "AB123456",
      });
      expect(screen.getByText("AB123456")).toBeVisible();
      expect(screen.queryByText("OLD")).toBeNull();
    },
  );
  it.each([
    [-1, "text-destructive", "Expired"],
    [0, "text-destructive", "Expires soon"],
    [6, "text-destructive", "Expires soon"],
    [7, "text-warning", "Expires soon"],
    [30, "text-warning", "Expires soon"],
    [31, "text-success", "Valid"],
  ])(
    "styles expiry %i days away and includes a text cue",
    (days, color, status) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 12, 23, 59));
      const expiry = new Date(2026, 8, 12 + Number(days));
      const { container } = renderSummary({
        expiresOn: {
          day: String(expiry.getDate()),
          month: String(expiry.getMonth() + 1),
          year: String(expiry.getFullYear()),
        },
      });
      expect(container.querySelector("time")!.parentElement).toHaveClass(
        String(color),
      );
      expect(screen.getByText(new RegExp(String(status)))).toBeVisible();
    },
  );
  it("shows only upload confirmation for proof of address", () => {
    renderSummary({
      type: "proofOfAddress",
      number: "IGNORE",
      expiresOn: { day: "1", month: "1", year: "2020" },
      photos: {
        front: {
          id: "proof",
          status: "uploaded",
          uploadToken: "token",
          file: new File(["pdf"], "proof.pdf", { type: "application/pdf" }),
        },
      },
    });
    expect(screen.getByText("Uploaded successfully")).toBeVisible();
    expect(screen.queryByText("IGNORE")).toBeNull();
    expect(screen.queryByText(/Expires|Expired|expiration/)).toBeNull();
  });
  it("distinguishes an invalid expiry from a document without expiry", () => {
    const view = renderSummary({
      expiresOn: { day: "15", month: "", year: "" },
    });
    expect(screen.getByText(/Check date/)).toBeVisible();
    view.unmount();
    renderSummary({ hasExpiryDate: false });
    expect(screen.getByText("No expiration date")).toBeVisible();
  });
});
