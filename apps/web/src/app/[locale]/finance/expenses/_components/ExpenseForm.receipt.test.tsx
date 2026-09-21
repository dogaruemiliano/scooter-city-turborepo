import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExpenseForm } from "./ExpenseForm";
import type {
  ExpenseFormFocusField,
  ExpenseFormValues,
} from "../_lib/expense-form";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createSupplier: vi.fn(),
  preview: vi.fn(),
  upload: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../_lib/expense-api", () => ({
  createExpense: mocks.create,
  createSupplier: mocks.createSupplier,
  previewExpense: mocks.preview,
  uploadExpenseReceipt: mocks.upload,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

const book: v1.finance.FinanceBook = {
  id: "company-book",
  name: "Company",
  names: { ro: "Company" },
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

const initialValues: ExpenseFormValues = {
  bookId: book.id,
  supplierId: "",
  occurredAt: "2026-08-19",
  description: "Engine oil",
  amount: "25.00",
  treatment: "OPERATING_EXPENSE",
  categoryId: category.id,
  costObjectId: "",
  payments: [
    {
      sourceType: "BOOK_ACCOUNT",
      sourceAccountId: account.id,
      payerAssociateId: "",
      paymentMethod: "CARD",
      amount: "25.00",
    },
  ],
  allocations: [
    {
      type: "COMMON",
      associateId: "",
      amount: "25.00",
    },
  ],
  documents: [],
};

describe("ExpenseForm receipt evidence", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "operation-1" });
    mocks.createSupplier.mockReset().mockResolvedValue({
      id: "supplier-1",
      name: "ROTAKT SRL",
      taxIdentifier: "RO6334441",
      isVatPayer: true,
      isActive: true,
      createdAt: "2026-08-23T10:00:00.000Z",
      updatedAt: "2026-08-23T10:00:00.000Z",
    });
    mocks.preview.mockReset().mockResolvedValue(undefined);
    mocks.upload.mockReset().mockResolvedValue("receipt-upload-token");
    mocks.push.mockReset();
    mocks.refresh.mockReset();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:receipt-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("keeps the selected image local until a valid expense is submitted", async () => {
    const browser = userEvent.setup();
    renderExpenseForm();
    const file = new File(["receipt"], "oil-receipt.webp", {
      type: "image/webp",
    });

    await browser.upload(
      screen.getByLabelText(/Choose receipt or bill image/),
      file,
    );

    expect(
      screen.getByRole("img", { name: "Selected receipt or bill" }),
    ).toHaveAttribute("src", "blob:receipt-preview");
    expect(screen.getByText("oil-receipt.webp")).toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();

    await browser.click(screen.getByRole("button", { name: "Record expense" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(file));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ receiptUploadToken: "receipt-upload-token" }),
      expect.any(String),
    );
  });

  it("keeps a failed image ready so submitting again retries the upload", async () => {
    mocks.upload
      .mockRejectedValueOnce(new Error("S3 unavailable"))
      .mockResolvedValueOnce("receipt-upload-token");
    const browser = userEvent.setup();
    renderExpenseForm();
    const file = new File(["receipt"], "receipt.jpg", {
      type: "image/jpeg",
    });

    await browser.upload(
      screen.getByLabelText(/Choose receipt or bill image/),
      file,
    );
    await browser.click(screen.getByRole("button", { name: "Record expense" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The image could not be uploaded. Record the expense again to retry, or remove the image.",
    );
    expect(mocks.create).not.toHaveBeenCalled();

    await browser.click(screen.getByRole("button", { name: "Record expense" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  });

  it("gets a fresh receipt token when expense creation fails before a retry", async () => {
    mocks.upload
      .mockResolvedValueOnce("first-receipt-token")
      .mockResolvedValueOnce("second-receipt-token");
    mocks.create
      .mockRejectedValueOnce(new Error("API temporarily unavailable"))
      .mockResolvedValueOnce({ id: "operation-1" });
    const browser = userEvent.setup();
    renderExpenseForm();
    const file = new File(["receipt"], "receipt.jpg", {
      type: "image/jpeg",
    });

    await browser.upload(
      screen.getByLabelText(/Choose receipt or bill image/),
      file,
    );
    await browser.click(screen.getByRole("button", { name: "Record expense" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));

    await browser.click(screen.getByRole("button", { name: "Record expense" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ receiptUploadToken: "second-receipt-token" }),
      expect.any(String),
    );
  });

  it("resolves an unmatched extracted supplier before saving manually", async () => {
    const browser = userEvent.setup();
    renderExpenseForm("extraction-draft-1", {
      ...initialValues,
      documents: [
        {
          type: "RECEIPT",
          documentSeries: "",
          documentNumber: "706210",
          issuedAt: "2026-08-19",
          supplierName: "ROTAKT SRL",
          supplierTaxId: "C.F. RO6334441",
          notes: "",
        },
      ],
    });

    await browser.click(screen.getByRole("button", { name: "Record expense" }));

    await waitFor(() =>
      expect(mocks.createSupplier).toHaveBeenCalledWith({
        name: "ROTAKT SRL",
        taxIdentifier: "C.F. RO6334441",
      }),
    );
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: "supplier-1",
          extractionDraftId: "extraction-draft-1",
        }),
        expect.any(String),
      ),
    );
  });

  it("shows the claimed scan instead of a second upload control", () => {
    renderExpenseForm("extraction-draft-1");

    expect(screen.getByText("Receipt image attached")).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Choose receipt or bill image/),
    ).not.toBeInTheDocument();
  });

  it("shows series only for bills and clears it when the type changes", async () => {
    const browser = userEvent.setup();
    renderExpenseForm(undefined, {
      ...initialValues,
      documents: [
        {
          type: "INVOICE",
          documentSeries: "VL",
          documentNumber: "639013079",
          issuedAt: "2026-08-19",
          supplierName: "REGISTRUL AUTO ROMAN R.A.",
          supplierTaxId: "RO1590236",
          notes: "",
        },
      ],
    });

    const typeSelect = screen.getByRole("combobox", { name: "Type" });
    expect(screen.getByLabelText("Series")).toHaveValue("VL");

    await browser.click(typeSelect);
    await browser.click(await screen.findByRole("option", { name: "Receipt" }));
    expect(screen.queryByLabelText("Series")).not.toBeInTheDocument();

    await browser.click(typeSelect);
    await browser.click(await screen.findByRole("option", { name: "Bill" }));
    expect(screen.getByLabelText("Series")).toHaveValue("");
  });

  it("focuses the missing category carried over from extraction review", async () => {
    renderExpenseForm(
      "extraction-draft-1",
      { ...initialValues, categoryId: "" },
      "categoryId",
    );

    const categorySelect = screen.getByRole("combobox", { name: "Category" });
    await waitFor(() => expect(categorySelect).toHaveFocus());
    expect(categorySelect).toHaveAttribute("aria-invalid", "true");
  });
});

function renderExpenseForm(
  extractionDraftId?: string,
  values: ExpenseFormValues = initialValues,
  initialFocusField?: ExpenseFormFocusField,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ExpenseForm
        book={book}
        books={[book]}
        accounts={[account]}
        categories={[category]}
        costObjects={[]}
        expensesHref="/en/finance/expenses"
        initialValues={values}
        extractionDraftId={extractionDraftId}
        initialFocusField={initialFocusField}
      />
    </NextIntlClientProvider>,
  );
}
