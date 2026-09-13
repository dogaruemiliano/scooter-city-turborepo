import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { ImageCaptureProps } from "@repo/ui/components/image-capture";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { type ComponentProps, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExpenseReceiptCapture } from "./ExpenseReceiptCapture";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  create: vi.fn(),
  createSupplier: vi.fn(),
  captureProps: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../_lib/expense-api", () => ({
  analyzeExpenseReceipt: mocks.analyze,
  createExpense: mocks.create,
  createSupplier: mocks.createSupplier,
}));

// Camera and crop behavior are tested with the shared component. These tests
// exercise the hand-off of its confirmed file into expense analysis and review.
vi.mock("@repo/ui/components/image-capture", () => ({
  ImageCapture: function CaptureBoundary(props: ImageCaptureProps) {
    const [error, setError] = useState("");
    mocks.captureProps(props);
    if (!props.open) return null;
    return (
      <div role="dialog" aria-label={props.labels?.title}>
        <button type="button" onClick={() => props.onOpenChange(false)}>
          {props.labels?.close}
        </button>
        <input
          type="file"
          aria-label="Confirmed photo"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            event.target.value = "";
            setError("");
            void Promise.resolve(props.onCapture(file, { originalFile: file }))
              .then(() => props.onOpenChange(false))
              .catch((caught: Error) => setError(caught.message));
          }}
        />
        {props.cameraActions}
        {error ? <p role="alert">{error}</p> : null}
      </div>
    );
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: ComponentProps<"a">) => (
    <a href={String(href)} {...props} />
  ),
  useRouter: () => ({
    back: mocks.back,
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

const book: v1.finance.FinanceBook = {
  id: "company-book",
  name: "Company",
  type: "COMPANY",
  functionalCurrency: "RON",
  members: [],
};

const account: v1.finance.LedgerAccount = {
  id: "bank-account",
  bookId: book.id,
  code: "BANK",
  name: "Company bank account",
  category: "ASSET",
  role: "BANK",
  associateId: null,
  associate: null,
  isDefault: true,
  isActive: true,
  isSystem: true,
};

const category: v1.finance.ExpenseCategory = {
  id: "parts-category",
  bookId: book.id,
  code: "PARTS",
  name: "Parts",
  defaultTreatment: "OPERATING_EXPENSE",
  isActive: true,
};

const candidate = <T,>(value: T) => ({
  value,
  confidence: 98,
  evidence: [],
});

const extractionDraft: v1.finance.ExpenseExtractionDraft = {
  id: "draft-42",
  sourceUploadId: "upload-42",
  status: "READY",
  provider: "aws-textract",
  providerRequestId: "request-42",
  parserVersion: "expense-v5",
  result: {
    amountMinor: candidate(27_500),
    occurredAt: candidate("2026-07-31"),
    currency: candidate("RON"),
    supplierName: candidate("DIACONU NICOLETA"),
    supplierTaxIdentifier: candidate("RO28000817"),
    customerName: candidate("JUSEM HUB SRL"),
    customerTaxIdentifier: candidate("54842598"),
    documentSeries: candidate<string | null>(null),
    documentNumber: candidate("BF.0025"),
    companyMatch: {
      status: "MATCHED",
      matchedBy: "TAX_IDENTIFIER",
      evidence: [],
    },
    suggestedBookType: "COMPANY",
    suggestedDocumentType: "RECEIPT",
    suggestedPaymentMethod: "CARD",
    suggestedAllocationType: "COMMON",
    suggestedCategoryCode: "PARTS",
    suggestionEvidence: {
      bookType: [],
      documentType: [],
      paymentMethod: [],
      allocationType: [],
      categoryCode: [],
    },
    explanations: [],
  },
  failureCode: null,
  failureMessage: null,
  confirmedOperationId: null,
  createdAt: "2026-08-22T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:01.000Z",
};

describe("ExpenseReceiptCapture", () => {
  beforeEach(() => {
    mocks.analyze.mockReset().mockResolvedValue(extractionDraft);
    mocks.create.mockReset().mockResolvedValue({ id: "operation-42" });
    mocks.createSupplier.mockReset().mockResolvedValue({
      id: "supplier-created",
      name: "DIACONU NICOLETA",
      taxIdentifier: "RO28000817",
      isVatPayer: true,
      isActive: true,
      createdAt: "2026-08-22T10:00:00.000Z",
      updatedAt: "2026-08-22T10:00:00.000Z",
    });
    mocks.captureProps.mockReset();
    mocks.back.mockReset();
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:receipt");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  it("uses shared capture with cropping, image imports, and manual entry", async () => {
    const browser = userEvent.setup();
    renderCapture();

    expect(mocks.captureProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        allowGallery: true,
        allowCrop: true,
      }),
    );
    await browser.click(screen.getByRole("button", { name: "Add manually" }));
    expect(mocks.push).toHaveBeenCalledWith("/finance/expenses/new/manual");
  });

  it("returns to the previous page when initial capture is closed", async () => {
    const browser = userEvent.setup();
    renderCapture();

    await browser.click(screen.getByRole("button", { name: "Go back" }));
    expect(mocks.back).toHaveBeenCalledOnce();
  });

  it("analyzes the shared capture result, reviews it, and confirms the draft", async () => {
    const browser = userEvent.setup();
    renderCapture();
    const cropped = await confirmPhoto(browser);

    expect(mocks.analyze).toHaveBeenCalledWith(cropped);
    const reviewSheet = await screen.findByRole("dialog", {
      name: "Review expense",
    });
    expect(screen.queryByRole("dialog", { name: "Add expense" })).toBeNull();
    expect(reviewSheet).toHaveClass(
      "h-[calc(100dvh-var(--spacing-12))]",
      "lg:h-[calc(100dvh-var(--spacing-24))]",
      "lg:w-2xl",
    );
    expect(
      reviewSheet.querySelector('[data-slot="expense-extraction-review"]'),
    ).toHaveClass("bg-popover", "text-popover-foreground");
    expect(reviewSheet.querySelector(".bg-background")).toBeNull();
    expect(screen.getByText("Parts")).toBeInTheDocument();
    expect(screen.getByText("RO28000817")).toBeInTheDocument();
    expect(screen.getByText("Receipt attached")).toBeInTheDocument();
    expect(mocks.createSupplier).not.toHaveBeenCalled();

    await browser.click(screen.getByRole("button", { name: "Save expense" }));

    await waitFor(() =>
      expect(mocks.createSupplier).toHaveBeenCalledWith({
        name: "DIACONU NICOLETA",
        taxIdentifier: "RO28000817",
      }),
    );
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          extractionDraftId: "draft-42",
          supplierId: "supplier-created",
          documents: [
            expect.objectContaining({
              supplierName: "DIACONU NICOLETA",
              supplierTaxId: "RO28000817",
            }),
          ],
        }),
        expect.any(String),
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/finance/operations/operation-42");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("waits for analysis before leaving shared capture", async () => {
    let finishAnalysis!: (value: v1.finance.ExpenseExtractionDraft) => void;
    mocks.analyze.mockReturnValue(
      new Promise((resolve) => {
        finishAnalysis = resolve;
      }),
    );
    const browser = userEvent.setup();
    renderCapture();
    await confirmPhoto(browser);

    expect(screen.getByRole("dialog", { name: "Add expense" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Review expense" })).toBeNull();
    finishAnalysis(extractionDraft);

    expect(
      await screen.findByRole("dialog", { name: "Review expense" }),
    ).toBeVisible();
  });

  it("leaves failed analysis in shared capture so it can be retried", async () => {
    mocks.analyze.mockRejectedValueOnce(
      new Error("Receipt analysis unavailable"),
    );
    const browser = userEvent.setup();
    renderCapture();
    await confirmPhoto(browser);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Receipt analysis unavailable",
    );
    expect(screen.queryByRole("dialog", { name: "Review expense" })).toBeNull();
    expect(mocks.back).not.toHaveBeenCalled();

    await confirmPhoto(browser);
    expect(
      await screen.findByRole("dialog", { name: "Review expense" }),
    ).toBeVisible();
    expect(mocks.analyze).toHaveBeenCalledTimes(2);
  });

  it("opens the prefilled manual form with the receipt draft", async () => {
    const browser = userEvent.setup();
    renderCapture();
    await confirmPhoto(browser);
    await screen.findByRole("dialog", { name: "Review expense" });
    await browser.click(screen.getByRole("button", { name: "Edit manually" }));

    expect(mocks.push).toHaveBeenCalledWith(
      "/finance/expenses/new/manual?draft=draft-42",
    );
  });

  it("tells the manual form to focus the first missing extracted field", async () => {
    mocks.analyze.mockResolvedValue({
      ...extractionDraft,
      result: {
        ...extractionDraft.result!,
        suggestedCategoryCode: "UNKNOWN_CATEGORY",
      },
    });
    const browser = userEvent.setup();
    renderCapture();
    await confirmPhoto(browser);
    await screen.findByText("Fields that need attention");
    await browser.click(screen.getByRole("button", { name: "Edit manually" }));

    expect(mocks.push).toHaveBeenCalledWith(
      "/finance/expenses/new/manual?draft=draft-42&focus=categoryId",
    );
  });

  it("reopens dismissed review without analyzing again or losing edits", async () => {
    const browser = userEvent.setup();
    renderCapture();
    await confirmPhoto(browser);
    await screen.findByRole("dialog", { name: "Review expense" });

    await browser.click(
      screen.getByRole("button", { name: /Description.*DIACONU NICOLETA/ }),
    );
    const descriptionSheet = await screen.findByRole("dialog", {
      name: "Edit Description",
    });
    const description = within(descriptionSheet).getByLabelText("Description");
    await browser.clear(description);
    await browser.type(description, "Edited oil purchase");
    await browser.click(
      within(descriptionSheet).getByRole("button", { name: "Done" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Edit Description" }),
      ).not.toBeInTheDocument(),
    );
    await dismissReview();

    expect(screen.getByRole("img", { name: "Cropped receipt" })).toBeVisible();
    expect(mocks.back).not.toHaveBeenCalled();
    await browser.click(screen.getByRole("button", { name: "Review expense" }));

    await screen.findByRole("dialog", { name: "Review expense" });
    expect(mocks.analyze).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: /Description.*Edited oil purchase/ }),
    ).toBeVisible();
  });

  it("keeps the existing draft when a retake is cancelled", async () => {
    const browser = userEvent.setup();
    renderCapture();
    await confirmPhoto(browser);
    await screen.findByRole("dialog", { name: "Review expense" });
    await dismissReview();

    await browser.click(screen.getByRole("button", { name: "Retake photo" }));
    expect(screen.getByRole("dialog", { name: "Add expense" })).toBeVisible();
    await browser.click(screen.getByRole("button", { name: "Go back" }));

    expect(mocks.back).not.toHaveBeenCalled();
    await browser.click(screen.getByRole("button", { name: "Review expense" }));
    expect(
      await screen.findByRole("dialog", { name: "Review expense" }),
    ).toBeVisible();
    expect(mocks.analyze).toHaveBeenCalledOnce();
  });

  it("releases the receipt preview when leaving the page", async () => {
    const browser = userEvent.setup();
    const rendered = renderCapture();
    await confirmPhoto(browser);
    await screen.findByRole("dialog", { name: "Review expense" });

    rendered.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:receipt");
  });
});

async function confirmPhoto(browser: ReturnType<typeof userEvent.setup>) {
  const cropped = new File(["cropped"], "receipt-cropped.jpg", {
    type: "image/jpeg",
  });
  await browser.upload(screen.getByLabelText("Confirmed photo"), cropped);
  return cropped;
}

async function dismissReview() {
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Review expense" })).toBeNull(),
  );
}

function renderCapture() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ExpenseReceiptCapture
        books={[book]}
        accounts={[account]}
        categories={[category]}
        costObjects={[]}
        suppliers={[]}
        currentUserId="user-current"
      />
    </NextIntlClientProvider>,
  );
}
