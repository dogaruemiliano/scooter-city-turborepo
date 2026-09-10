import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExpenseReceiptCapture } from "./ExpenseReceiptCapture";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  create: vi.fn(),
  createSupplier: vi.fn(),
  crop: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

const originalMediaDevices = Object.getOwnPropertyDescriptor(
  navigator,
  "mediaDevices",
);

vi.mock("../_lib/expense-api", () => ({
  analyzeExpenseReceipt: mocks.analyze,
  createExpense: mocks.create,
  createSupplier: mocks.createSupplier,
}));

vi.mock("../_lib/receipt-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_lib/receipt-image")>()),
  cropReceiptImage: mocks.crop,
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
    mocks.analyze.mockReset();
    mocks.create.mockReset();
    mocks.createSupplier.mockReset().mockResolvedValue({
      id: "supplier-created",
      name: "DIACONU NICOLETA",
      taxIdentifier: "RO28000817",
      isVatPayer: true,
      isActive: true,
      createdAt: "2026-08-22T10:00:00.000Z",
      updatedAt: "2026-08-22T10:00:00.000Z",
    });
    mocks.crop.mockReset();
    mocks.back.mockReset();
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:source")
      .mockReturnValueOnce("blob:cropped");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });

  it("attaches a granted camera stream and enables capture when preview is ready", async () => {
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    mockCamera(getUserMedia);
    renderCapture();

    const preview = screen.getByLabelText("Camera preview") as HTMLVideoElement;
    const capture = screen.getByRole("button", { name: "Take photo" });

    expect(capture).toBeDisabled();
    await waitFor(() => expect(preview.srcObject).toBe(stream));
    fireEvent.canPlay(preview);

    expect(capture).toBeEnabled();
    expect(
      screen.queryByText(
        "The camera is unavailable. Choose a photo from your gallery or files instead.",
      ),
    ).not.toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
  });

  it("stops the camera stream after choosing a file", async () => {
    const browser = userEvent.setup();
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;
    mockCamera(vi.fn().mockResolvedValue(stream));
    renderCapture();

    const preview = screen.getByLabelText("Camera preview") as HTMLVideoElement;
    await waitFor(() => expect(preview.srcObject).toBe(stream));

    await browser.upload(
      screen.getByLabelText("Gallery / files", { selector: "input" }),
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );

    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(screen.getByText("Crop receipt")).toBeInTheDocument();
  });

  it("places gallery, capture, and manual actions on one aligned row", () => {
    renderCapture();

    const gallery = screen.getByRole("button", { name: "Gallery / files" });
    const capture = screen.getByRole("button", { name: "Take photo" });
    const manual = screen.getByRole("button", { name: "Add manually" });
    const actions = gallery.parentElement;
    const controls = actions?.parentElement;
    const preview = screen.getByLabelText("Camera preview");
    const topScrim = document.querySelector('[data-slot="camera-top-scrim"]');
    const bottomScrim = document.querySelector(
      '[data-slot="camera-bottom-scrim"]',
    );

    expect(actions).toBe(capture.parentElement);
    expect(actions).toBe(manual.parentElement);
    expect(actions).toHaveAttribute("data-slot", "camera-actions");
    expect(gallery).toHaveClass("justify-self-start");
    expect(capture).toHaveClass("justify-self-center");
    expect(manual).toHaveClass("justify-self-end");
    expect(gallery).not.toHaveTextContent("Gallery / files");
    expect(manual).not.toHaveTextContent("Add manually");
    expect(gallery.querySelector("svg")).toHaveClass("size-6");
    expect(manual.querySelector("svg")).toHaveClass(
      "lucide-clipboard-pen-line",
      "size-6",
    );
    expect(controls).toHaveAttribute("data-slot", "camera-controls");
    expect(controls).toHaveClass("absolute", "inset-x-0", "bottom-0");
    expect(controls?.className).not.toMatch(/\bbg-/);
    expect(preview).toHaveClass("absolute", "inset-0", "size-full");
    expect(topScrim).toHaveClass(
      "pointer-events-none",
      "top-0",
      "bg-gradient-to-b",
      "from-scrim",
      "to-transparent",
    );
    expect(bottomScrim).toHaveClass(
      "pointer-events-none",
      "bottom-0",
      "bg-gradient-to-t",
      "from-scrim",
      "to-transparent",
    );
  });

  it("uses the top-left close action to return to the previous page", async () => {
    const browser = userEvent.setup();
    renderCapture();

    await browser.click(screen.getByRole("button", { name: "Go back" }));

    expect(mocks.back).toHaveBeenCalledOnce();
  });

  it("crops before uploading, reviews the extraction, and confirms the draft", async () => {
    const browser = userEvent.setup();
    const cropped = new File(["cropped"], "receipt-cropped.jpg", {
      type: "image/jpeg",
    });
    mocks.crop.mockResolvedValue(cropped);
    mocks.analyze.mockResolvedValue(extractionDraft);
    mocks.create.mockResolvedValue({ id: "operation-42" });
    renderCapture();

    const source = new File(["receipt"], "receipt.jpg", {
      type: "image/jpeg",
    });
    await browser.upload(
      screen.getByLabelText("Gallery / files", { selector: "input" }),
      source,
    );
    expect(screen.getByText("Crop receipt")).toBeInTheDocument();
    const cropBack = screen.getByRole("button", { name: "Back to camera" });
    const cropTitle = screen.getByRole("heading", { name: "Crop receipt" });
    expect(cropBack.parentElement).toBe(cropTitle.parentElement);
    expect(cropBack.parentElement).toHaveClass("grid", "items-center");
    expect(screen.getByRole("button", { name: "Use photo" })).toHaveClass(
      "w-full",
    );
    expect(
      screen.queryByRole("button", { name: "Remove photo" }),
    ).not.toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Use photo" }));

    await waitFor(() =>
      expect(mocks.crop).toHaveBeenCalledWith(source, expect.any(Object)),
    );
    expect(mocks.analyze).toHaveBeenCalledWith(cropped);
    expect(await screen.findByText("Review expense")).toBeInTheDocument();
    const reviewSheet = screen.getByRole("dialog", {
      name: "Review expense",
    });
    expect(reviewSheet).toHaveClass(
      "h-[calc(100dvh-var(--spacing-12))]",
      "lg:h-[calc(100dvh-var(--spacing-24))]",
      "lg:w-2xl",
    );
    expect(reviewSheet).not.toHaveClass("h-dvh", "rounded-none");
    expect(
      reviewSheet.querySelector('[data-slot="expense-extraction-review"]'),
    ).toHaveClass("bg-popover", "text-popover-foreground");
    expect(reviewSheet.querySelector(".bg-background")).toBeNull();
    expect(screen.getByText("Review expense")).toHaveClass("sr-only");
    expect(
      screen.queryByRole("button", { name: "Close review" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Parts")).toBeInTheDocument();
    expect(screen.getAllByText("DIACONU NICOLETA")).not.toHaveLength(0);
    expect(screen.getByText("RO28000817")).toBeInTheDocument();
    expect(screen.getByText("Receipt attached")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit Amount" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Date.*07\/31\/2026/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Supplier.*DIACONU NICOLETA.*RO28000817/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Finance book.*Company/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cropped receipt" })).toHaveClass(
      "object-contain",
      "object-center",
    );
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
  });

  it("uses the crop back arrow to discard the image and reopen the camera", async () => {
    const browser = userEvent.setup();
    renderCapture();
    await browser.upload(
      screen.getByLabelText("Gallery / files", { selector: "input" }),
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );

    await browser.click(screen.getByRole("button", { name: "Back to camera" }));

    expect(screen.getByText("Add expense")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Take photo" }),
    ).toBeInTheDocument();
    expect(mocks.back).not.toHaveBeenCalled();
  });

  it("opens the prefilled manual form with the uploaded receipt draft", async () => {
    const browser = userEvent.setup();
    const cropped = new File(["cropped"], "receipt-cropped.jpg", {
      type: "image/jpeg",
    });
    mocks.crop.mockResolvedValue(cropped);
    mocks.analyze.mockResolvedValue(extractionDraft);
    renderCapture();

    await browser.upload(
      screen.getByLabelText("Gallery / files", { selector: "input" }),
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );
    await browser.click(screen.getByRole("button", { name: "Use photo" }));
    await screen.findByText("Review expense");
    await browser.click(screen.getByRole("button", { name: "Edit manually" }));

    expect(mocks.push).toHaveBeenCalledWith(
      "/finance/expenses/new/manual?draft=draft-42",
    );
  });

  it("tells the manual form to focus the first missing extracted field", async () => {
    const browser = userEvent.setup();
    const cropped = new File(["cropped"], "receipt-cropped.jpg", {
      type: "image/jpeg",
    });
    mocks.crop.mockResolvedValue(cropped);
    mocks.analyze.mockResolvedValue({
      ...extractionDraft,
      result: {
        ...extractionDraft.result!,
        suggestedCategoryCode: "UNKNOWN_CATEGORY",
      },
    });
    renderCapture();

    await browser.upload(
      screen.getByLabelText("Gallery / files", { selector: "input" }),
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );
    await browser.click(screen.getByRole("button", { name: "Use photo" }));
    await screen.findByText("Fields that need attention");
    await browser.click(screen.getByRole("button", { name: "Edit manually" }));

    expect(mocks.push).toHaveBeenCalledWith(
      "/finance/expenses/new/manual?draft=draft-42&focus=categoryId",
    );
  });

  it("returns to the crop page when the review sheet is dismissed", async () => {
    const browser = userEvent.setup();
    const cropped = new File(["cropped"], "receipt-cropped.jpg", {
      type: "image/jpeg",
    });
    mocks.crop.mockResolvedValue(cropped);
    mocks.analyze.mockResolvedValue(extractionDraft);
    renderCapture();

    await browser.upload(
      screen.getByLabelText("Gallery / files", { selector: "input" }),
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );
    await browser.click(screen.getByRole("button", { name: "Use photo" }));
    await screen.findByRole("dialog", { name: "Review expense" });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Review expense" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Crop receipt")).toBeInTheDocument();
    expect(mocks.back).not.toHaveBeenCalled();
  });

  it("reopens the ready review without recropping, uploading, or losing edits", async () => {
    const browser = userEvent.setup();
    const cropped = new File(["cropped"], "receipt-cropped.jpg", {
      type: "image/jpeg",
    });
    mocks.crop.mockResolvedValue(cropped);
    mocks.analyze.mockResolvedValue(extractionDraft);
    renderCapture();

    await browser.upload(
      screen.getByLabelText("Gallery / files", { selector: "input" }),
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );
    await browser.click(screen.getByRole("button", { name: "Use photo" }));
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

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Review expense" }),
      ).not.toBeInTheDocument(),
    );
    await browser.click(screen.getByRole("button", { name: "Use photo" }));

    await screen.findByRole("dialog", { name: "Review expense" });
    expect(mocks.crop).toHaveBeenCalledOnce();
    expect(mocks.analyze).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", {
        name: /Description.*Edited oil purchase/,
      }),
    ).toBeVisible();
  });

  it("keeps manual entry available before a photo is selected", async () => {
    const browser = userEvent.setup();
    renderCapture();

    await browser.click(screen.getByRole("button", { name: "Add manually" }));
    expect(mocks.push).toHaveBeenCalledWith("/finance/expenses/new/manual");
  });
});

function mockCamera(getUserMedia: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
}

function renderCapture() {
  const rendered = render(
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
  const page = screen
    .getByRole("heading", { name: "Add expense" })
    .closest('[data-slot="expense-capture-page"]');
  expect(page).toHaveClass("fixed", "inset-0");
  expect(page?.closest('[data-slot="bottom-sheet-popup"]')).toBeNull();
  return rendered;
}
