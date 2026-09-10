import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { aspectRatio } from "@repo/theme";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetTitle,
} from "@repo/ui/components";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  expenseFormDefaultsFromExtraction,
  toCreateExpenseInput,
  type ExpenseFormValues,
} from "../_lib/expense-form";
import { ExpenseExtractionReview } from "./ExpenseExtractionReview";

const mocks = vi.hoisted(() => ({
  createSupplier: vi.fn(),
  editManually: vi.fn(),
  updateSupplier: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("../_lib/expense-api", () => ({
  createSupplier: mocks.createSupplier,
  updateSupplier: mocks.updateSupplier,
}));

vi.mock("next/image", () => ({
  default: (
    props: ComponentProps<"img"> & {
      fill?: boolean;
      unoptimized?: boolean;
    },
  ) => {
    const imageProps = { ...props };
    Reflect.deleteProperty(imageProps, "fill");
    Reflect.deleteProperty(imageProps, "unoptimized");

    return (
      // eslint-disable-next-line @next/next/no-img-element -- test double for next/image load behavior.
      <img {...imageProps} alt={props.alt ?? ""} />
    );
  },
}));

const currentAssociate: v1.finance.FinanceAssociate = {
  id: "associate-current",
  email: "emiliano@example.com",
  firstName: "Emiliano",
  lastName: "Dogaru",
  displayName: "Emiliano Dogaru",
};

const member: v1.finance.FinanceBookMember = {
  id: "member-current",
  associateId: currentAssociate.id,
  associate: currentAssociate,
  shareBasisPoints: 10_000,
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: null,
};

const companyBook: v1.finance.FinanceBook = {
  id: "company-book",
  name: "Company",
  type: "COMPANY",
  functionalCurrency: "RON",
  members: [member],
};

const personalBook: v1.finance.FinanceBook = {
  id: "personal-book",
  name: "Personal funds",
  type: "ASSOCIATE_POOL",
  functionalCurrency: "RON",
  members: [member],
};

const bankAccount: v1.finance.LedgerAccount = {
  id: "bank-account",
  bookId: companyBook.id,
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

const companyCategory: v1.finance.ExpenseCategory = {
  id: "company-parts",
  bookId: companyBook.id,
  code: "PARTS",
  name: "Parts",
  defaultTreatment: "OPERATING_EXPENSE",
  isActive: true,
};

const personalCategory: v1.finance.ExpenseCategory = {
  id: "personal-parts",
  bookId: personalBook.id,
  code: "PARTS",
  name: "Parts",
  defaultTreatment: "ASSOCIATE_POOL_EXPENSE",
  isActive: true,
};

const companyFuelCategory: v1.finance.ExpenseCategory = {
  id: "company-fuel",
  bookId: companyBook.id,
  code: "FUEL",
  name: "Fuel",
  defaultTreatment: "OPERATING_EXPENSE",
  isActive: true,
};

const companyOtherCategory: v1.finance.ExpenseCategory = {
  id: "company-other",
  bookId: companyBook.id,
  code: "OTHER",
  name: "Company other",
  defaultTreatment: null,
  isActive: true,
};

const personalSharedCategory: v1.finance.ExpenseCategory = {
  id: "personal-shared",
  bookId: personalBook.id,
  code: "POOL_SHARED_COST",
  name: "Shared pool cost",
  defaultTreatment: "ASSOCIATE_POOL_EXPENSE",
  isActive: true,
};

const personalOtherCategory: v1.finance.ExpenseCategory = {
  id: "personal-other",
  bookId: personalBook.id,
  code: "POOL_OTHER",
  name: "Pool other",
  defaultTreatment: "ASSOCIATE_POOL_EXPENSE",
  isActive: true,
};

const scooterCostObject: v1.finance.CostObject = {
  id: "scooter-14",
  bookId: companyBook.id,
  code: "SCOOTER_14",
  name: "Scooter 14",
  type: "VEHICLE",
  ownershipType: "COMPANY",
  ownerAssociateId: null,
  externalEntityType: null,
  externalEntityId: null,
  defaultAllocationType: "COMMON",
  defaultBeneficiaryAssociateId: null,
  isActive: true,
};

const categories = [
  companyCategory,
  companyFuelCategory,
  companyOtherCategory,
  personalCategory,
  personalSharedCategory,
  personalOtherCategory,
];

const candidate = <T,>(value: T) => ({
  value,
  confidence: 98,
  evidence: [],
});

const draft: v1.finance.ExpenseExtractionDraft = {
  id: "draft-42",
  sourceUploadId: "upload-42",
  status: "READY",
  provider: "aws-textract",
  providerRequestId: "request-42",
  parserVersion: "expense-v6",
  result: {
    amountMinor: candidate(2_500),
    occurredAt: candidate("2026-07-31"),
    currency: candidate("RON"),
    supplierName: candidate("ROTAKT SRL"),
    supplierTaxIdentifier: candidate("RO6334441"),
    customerName: candidate<string | null>(null),
    customerTaxIdentifier: candidate<string | null>(null),
    documentSeries: candidate<string | null>(null),
    documentNumber: candidate("0001"),
    companyMatch: {
      status: "MISMATCHED",
      matchedBy: null,
      evidence: [],
    },
    suggestedBookType: "ASSOCIATE_POOL",
    suggestedDocumentType: "RECEIPT",
    suggestedPaymentMethod: "CASH",
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

const storedSupplier = supplier({
  id: "supplier-rotakt",
  name: "ROTAKT SRL",
  taxIdentifier: "RO6334441",
  isVatPayer: true,
});

describe("ExpenseExtractionReview", () => {
  beforeEach(() => {
    mocks.createSupplier.mockReset();
    mocks.editManually.mockReset();
    mocks.updateSupplier.mockReset();
    mocks.submit.mockReset();
  });

  it("places the full portrait receipt preview after the extracted fields", () => {
    renderReview({ values: companyValues() });

    const fields = document.querySelector(
      '[data-slot="expense-extraction-fields"]',
    );
    const preview = document.querySelector('[data-slot="receipt-preview"]');
    const frame = document.querySelector('[data-slot="receipt-preview-frame"]');

    expect(fields).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(fields?.compareDocumentPosition(preview as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(frame).toHaveClass("w-full", "sm:max-w-72");
    expect(frame).toHaveStyle({
      aspectRatio: String(aspectRatio.receiptPortrait),
    });
    const receipt = screen.getByRole("img", { name: "Cropped receipt" });
    expect(receipt).toHaveClass("object-contain", "object-center");

    Object.defineProperties(receipt, {
      naturalWidth: { configurable: true, value: 600 },
      naturalHeight: { configurable: true, value: 900 },
    });
    fireEvent.load(receipt);

    expect(frame).toHaveStyle({ aspectRatio: String(2 / 3) });
  });

  it("caps a very tall receipt preview at three times its width", () => {
    renderReview({ values: companyValues() });

    const frame = document.querySelector('[data-slot="receipt-preview-frame"]');
    const receipt = screen.getByRole("img", { name: "Cropped receipt" });
    Object.defineProperties(receipt, {
      naturalWidth: { configurable: true, value: 200 },
      naturalHeight: { configurable: true, value: 800 },
    });
    fireEvent.load(receipt);

    expect(frame).toHaveStyle({
      aspectRatio: String(aspectRatio.receiptPortrait),
    });
  });

  it("allows saving when the detected supplier has a name but no CIF", async () => {
    const browser = userEvent.setup();
    const values = companyValues();
    renderReview({
      values: {
        ...values,
        documents: values.documents.map((document) => ({
          ...document,
          supplierTaxId: "",
        })),
      },
    });

    const save = screen.getByRole("button", { name: "Save expense" });
    expect(save).toBeEnabled();

    await browser.click(save);

    expect(mocks.submit).toHaveBeenCalledOnce();
  });

  it("lists a missing category and hands its field to manual editing", async () => {
    const browser = userEvent.setup();
    renderReview({ values: companyValues({ categoryId: "" }) });

    const warning = screen.getByRole("status");
    expect(
      within(warning).getByText("Fields that need attention"),
    ).toBeVisible();
    expect(within(warning).getByRole("listitem")).toHaveTextContent("Category");
    expect(screen.getByRole("button", { name: "Save expense" })).toBeDisabled();

    await browser.click(screen.getByRole("button", { name: "Edit manually" }));

    expect(mocks.editManually).toHaveBeenCalledWith("categoryId");
  });

  it("edits the amount inline and keeps the expense, payment, and allocation totals synchronized", async () => {
    const browser = userEvent.setup();
    renderReview({ values: companyValues() });

    await browser.click(screen.getByRole("button", { name: "Edit Amount" }));
    const amount = screen.getByRole("textbox", { name: "Amount" });
    expect(amount).toHaveFocus();

    await browser.clear(amount);
    await browser.type(amount, "30.50{Enter}");
    await browser.click(screen.getByRole("button", { name: "Save expense" }));

    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 3_050,
        payments: [expect.objectContaining({ amountMinor: 3_050 })],
        allocations: [expect.objectContaining({ amountMinor: 3_050 })],
      }),
    );
  });

  it("opens the date picker as a stacked sheet and updates the expense and document dates", async () => {
    const browser = userEvent.setup();
    renderReview({ values: companyValues(), inSheet: true });

    const reviewSheet = await screen.findByRole("dialog", {
      name: "Review expense",
    });
    await browser.click(
      within(reviewSheet).getByRole("button", { name: /Date.*07\/31\/2026/ }),
    );

    const dateSheet = await screen.findByRole("dialog", {
      name: "Choose expense date",
    });
    expect(
      document.querySelectorAll('[data-slot="bottom-sheet-popup"]'),
    ).toHaveLength(2);
    expect(reviewSheet).toHaveAttribute("data-nested-drawer-open");
    expect(dateSheet).toHaveAttribute("data-slot", "bottom-sheet-popup");

    await browser.click(
      within(dateSheet).getByRole("button", {
        name: "July 30, 2026",
      }),
    );
    await browser.click(screen.getByRole("button", { name: "Save expense" }));

    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        occurredAt: "2026-07-30T00:00:00.000Z",
        documents: [
          expect.objectContaining({
            issuedAt: "2026-07-30T00:00:00.000Z",
          }),
        ],
      }),
    );
  });

  it("switches to personal funds and defaults payment to the current associate and benefit to common", async () => {
    const browser = userEvent.setup();
    renderReview({ values: companyValues() });

    await browser.click(
      screen.getByRole("button", { name: /Finance book.*Company/ }),
    );
    const bookSheet = await screen.findByRole("dialog", {
      name: "Choose finance book",
    });
    await browser.click(
      within(bookSheet).getByRole("button", { name: /Personal funds/ }),
    );

    expect(screen.getByText("Personal funds · Emiliano Dogaru")).toBeVisible();
    expect(screen.getByText("Shared by everyone")).toBeVisible();
    await browser.click(screen.getByRole("button", { name: "Save expense" }));

    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: personalBook.id,
        treatment: "ASSOCIATE_POOL_EXPENSE",
        categoryId: personalCategory.id,
        payments: [
          expect.objectContaining({
            sourceType: "ASSOCIATE_PERSONAL_FUNDS",
            payerAssociateId: currentAssociate.id,
          }),
        ],
        allocations: [expect.objectContaining({ type: "COMMON" })],
      }),
    );
  });

  it.each([
    {
      name: "maps a company category without an exact pool match to the shared pool category",
      initialValues: companyValues({ categoryId: companyFuelCategory.id }),
      targetBook: /Personal funds/,
      expectedCategory: personalSharedCategory,
    },
    {
      name: "maps the company other category to pool other",
      initialValues: companyValues({ categoryId: companyOtherCategory.id }),
      targetBook: /Personal funds/,
      expectedCategory: personalOtherCategory,
    },
    {
      name: "maps a pool category without an exact company match to company other",
      initialValues: companyValues({
        bookId: personalBook.id,
        treatment: "ASSOCIATE_POOL_EXPENSE",
        categoryId: personalSharedCategory.id,
        payments: [
          {
            sourceType: "ASSOCIATE_PERSONAL_FUNDS",
            sourceAccountId: "",
            payerAssociateId: currentAssociate.id,
            paymentMethod: "CASH",
            amount: "25.00",
          },
        ],
      }),
      targetBook: /Company/,
      expectedCategory: companyOtherCategory,
    },
  ])("$name", async ({ initialValues, targetBook, expectedCategory }) => {
    const browser = userEvent.setup();
    renderReview({ values: initialValues });

    await browser.click(screen.getByRole("button", { name: /Finance book/ }));
    const bookSheet = await screen.findByRole("dialog", {
      name: "Choose finance book",
    });
    await browser.click(
      within(bookSheet).getByRole("button", { name: targetBook }),
    );
    await browser.click(screen.getByRole("button", { name: "Save expense" }));

    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: expectedCategory.id }),
    );
  });

  it("edits the description, cost object, document type, and document notes without leaving review", async () => {
    const browser = userEvent.setup();
    renderReview({ values: companyValues() });

    expect(
      screen.queryByRole("button", { name: /Bill series/ }),
    ).not.toBeInTheDocument();

    await browser.click(
      screen.getByRole("button", { name: /Description.*ROTAKT SRL/ }),
    );
    const descriptionSheet = await screen.findByRole("dialog", {
      name: "Edit Description",
    });
    const description = within(descriptionSheet).getByLabelText("Description");
    await browser.clear(description);
    await browser.type(description, "Engine oil");
    await browser.click(
      within(descriptionSheet).getByRole("button", { name: "Done" }),
    );

    await browser.click(
      screen.getByRole("button", { name: /What it was for.*None/ }),
    );
    const costObjectSheet = await screen.findByRole("dialog", {
      name: "Choose what it was for",
    });
    await browser.click(
      within(costObjectSheet).getByRole("button", { name: "Scooter 14" }),
    );

    await browser.click(screen.getByRole("button", { name: /Type.*Receipt/ }));
    const documentTypeSheet = await screen.findByRole("dialog", {
      name: "Choose document type",
    });
    await browser.click(
      within(documentTypeSheet).getByRole("button", { name: "Bill" }),
    );

    await browser.click(
      screen.getByRole("button", { name: /Bill series.*Not found/ }),
    );
    await browser.type(screen.getByLabelText("Bill series"), "VL{Enter}");

    await browser.click(screen.getByRole("button", { name: /Notes.*None/ }));
    const notesSheet = await screen.findByRole("dialog", {
      name: "Edit Notes",
    });
    await browser.type(
      within(notesSheet).getByLabelText("Notes"),
      "Oil for the fleet",
    );
    await browser.click(
      within(notesSheet).getByRole("button", { name: "Done" }),
    );

    await browser.click(screen.getByRole("button", { name: "Save expense" }));

    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Engine oil",
        costObjectId: scooterCostObject.id,
        documents: [
          expect.objectContaining({
            type: "INVOICE",
            documentSeries: "VL",
            notes: "Oil for the fleet",
          }),
        ],
      }),
    );
  });

  it("clears the bill series when the document becomes a receipt", async () => {
    const browser = userEvent.setup();
    const values = companyValues();
    renderReview({
      values: {
        ...values,
        documents: values.documents.map((document) => ({
          ...document,
          type: "INVOICE",
          documentSeries: "VL",
        })),
      },
    });

    expect(
      screen.getByRole("button", { name: /Bill series.*VL/ }),
    ).toBeVisible();

    await browser.click(screen.getByRole("button", { name: /Type.*Bill/ }));
    let documentTypeSheet = await screen.findByRole("dialog", {
      name: "Choose document type",
    });
    await browser.click(
      within(documentTypeSheet).getByRole("button", { name: "Receipt" }),
    );

    expect(
      screen.queryByRole("button", { name: /Bill series/ }),
    ).not.toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: /Type.*Receipt/ }));
    documentTypeSheet = await screen.findByRole("dialog", {
      name: "Choose document type",
    });
    await browser.click(
      within(documentTypeSheet).getByRole("button", { name: "Bill" }),
    );

    expect(
      screen.getByRole("button", { name: /Bill series.*Not found/ }),
    ).toBeVisible();
  });

  it("opens the supplier list when none was detected, then selects the created API result and snapshots it", async () => {
    const browser = userEvent.setup();
    const created = supplier({
      id: "supplier-created",
      name: "LUBRICANTS SRL",
      taxIdentifier: "RO99887766",
      isVatPayer: true,
    });
    mocks.createSupplier.mockResolvedValue(created);
    renderReview({
      values: companyValues({
        supplierId: "",
        description: "",
        documents: [],
      }),
      suppliers: [storedSupplier],
    });

    await browser.click(
      screen.getByRole("button", { name: /Supplier.*Not found/ }),
    );
    const supplierSheet = await screen.findByRole("dialog", {
      name: "Choose supplier",
    });
    expect(within(supplierSheet).getByText("ROTAKT SRL")).toBeVisible();

    await browser.click(
      within(supplierSheet).getByRole("button", { name: "Add supplier" }),
    );
    expect(
      within(supplierSheet).getByRole("heading", { name: "Create supplier" }),
    ).toBeVisible();

    await browser.type(
      within(supplierSheet).getByLabelText("Supplier name"),
      created.name,
    );
    await browser.type(
      within(supplierSheet).getByLabelText("CIF / VAT number"),
      created.taxIdentifier,
    );
    expect(
      within(supplierSheet).getByText(/marked as a VAT payer/),
    ).toBeVisible();
    await browser.click(
      within(supplierSheet).getByRole("button", { name: "Save supplier" }),
    );

    await waitFor(() =>
      expect(mocks.createSupplier).toHaveBeenCalledWith({
        name: created.name,
        taxIdentifier: created.taxIdentifier,
      }),
    );
    expect(
      await screen.findByRole("button", {
        name: new RegExp(`Supplier.*${created.name}`),
      }),
    ).toBeVisible();
    await browser.click(screen.getByRole("button", { name: "Save expense" }));

    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: created.id,
        description: created.name,
        documents: [
          expect.objectContaining({
            supplierName: created.name,
            supplierTaxId: created.taxIdentifier,
          }),
        ],
      }),
    );
  });

  it("opens a detected but unrecognized supplier directly in a prefilled create form", async () => {
    const browser = userEvent.setup();
    renderReview({ values: companyValues(), suppliers: [] });

    await browser.click(
      screen.getByRole("button", { name: /Supplier.*ROTAKT SRL/ }),
    );
    const supplierSheet = await screen.findByRole("dialog", {
      name: "Create supplier",
    });

    expect(within(supplierSheet).getByLabelText("Supplier name")).toHaveValue(
      "ROTAKT SRL",
    );
    expect(
      within(supplierSheet).getByLabelText("CIF / VAT number"),
    ).toHaveValue("RO6334441");
  });

  it("auto-selects a matching stored supplier, opens edit mode, and snapshots the updated API result", async () => {
    const browser = userEvent.setup();
    const updated = supplier({
      ...storedSupplier,
      name: "ROTAKT DISTRIBUTION SRL",
      taxIdentifier: "RO6334442",
    });
    mocks.updateSupplier.mockResolvedValue(updated);
    const matchedValues = expenseFormDefaultsFromExtraction({
      extraction: draft.result!,
      books: [companyBook, personalBook],
      accounts: [bankAccount],
      categories: [companyCategory, personalCategory],
      suppliers: [storedSupplier],
      currentUserId: currentAssociate.id,
      fallbackBook: companyBook,
      today: "2026-08-23",
    });
    expect(matchedValues.supplierId).toBe(storedSupplier.id);
    renderReview({
      values: matchedValues,
      suppliers: [storedSupplier],
    });

    await browser.click(
      screen.getByRole("button", { name: /Supplier.*ROTAKT SRL/ }),
    );
    const supplierSheet = await screen.findByRole("dialog", {
      name: "Edit supplier",
    });
    const name = within(supplierSheet).getByLabelText("Supplier name");
    const cif = within(supplierSheet).getByLabelText("CIF / VAT number");
    await browser.clear(name);
    await browser.type(name, updated.name);
    await browser.clear(cif);
    await browser.type(cif, updated.taxIdentifier);
    await browser.click(
      within(supplierSheet).getByRole("button", { name: "Save supplier" }),
    );

    await waitFor(() =>
      expect(mocks.updateSupplier).toHaveBeenCalledWith(storedSupplier.id, {
        name: updated.name,
        taxIdentifier: updated.taxIdentifier,
      }),
    );
    await browser.click(screen.getByRole("button", { name: "Save expense" }));

    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: storedSupplier.id,
        description: updated.name,
        documents: [
          expect.objectContaining({
            supplierName: updated.name,
            supplierTaxId: updated.taxIdentifier,
          }),
        ],
      }),
    );
  });
});

function ReviewHarness({
  initialValues,
  suppliers,
}: {
  initialValues: ExpenseFormValues;
  suppliers: readonly v1.finance.Supplier[];
}) {
  const [values, setValues] = useState(initialValues);

  return (
    <ExpenseExtractionReview
      draft={draft}
      values={values}
      previewUrl="/receipt.jpg"
      books={[companyBook, personalBook]}
      accounts={[bankAccount]}
      categories={categories}
      costObjects={[scooterCostObject]}
      initialSuppliers={suppliers}
      currentUserId={currentAssociate.id}
      saving={false}
      onValuesChange={setValues}
      onSave={() => mocks.submit(toCreateExpenseInput(values))}
      onEditManually={mocks.editManually}
    />
  );
}

function renderReview({
  values,
  suppliers = [],
  inSheet = false,
}: {
  values: ExpenseFormValues;
  suppliers?: readonly v1.finance.Supplier[];
  inSheet?: boolean;
}) {
  const review = <ReviewHarness initialValues={values} suppliers={suppliers} />;

  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {inSheet ? (
        <BottomSheet open>
          <BottomSheetContent>
            <BottomSheetTitle className="sr-only">
              Review expense
            </BottomSheetTitle>
            {review}
          </BottomSheetContent>
        </BottomSheet>
      ) : (
        review
      )}
    </NextIntlClientProvider>,
  );
}

function companyValues(
  overrides: Partial<ExpenseFormValues> = {},
): ExpenseFormValues {
  return {
    bookId: companyBook.id,
    supplierId: "",
    occurredAt: "2026-07-31",
    description: "ROTAKT SRL",
    amount: "25.00",
    treatment: "OPERATING_EXPENSE",
    categoryId: companyCategory.id,
    costObjectId: "",
    payments: [
      {
        sourceType: "BOOK_ACCOUNT",
        sourceAccountId: bankAccount.id,
        payerAssociateId: "",
        paymentMethod: "CASH",
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
    documents: [
      {
        type: "RECEIPT",
        documentSeries: "",
        documentNumber: "0001",
        issuedAt: "2026-07-31",
        supplierName: "ROTAKT SRL",
        supplierTaxId: "RO6334441",
        notes: "",
      },
    ],
    ...overrides,
  };
}

function supplier(
  overrides: Partial<v1.finance.Supplier>,
): v1.finance.Supplier {
  return {
    id: "supplier-1",
    name: "Supplier SRL",
    taxIdentifier: "RO12345678",
    isVatPayer: true,
    isActive: true,
    createdAt: "2026-08-22T10:00:00.000Z",
    updatedAt: "2026-08-22T10:00:00.000Z",
    ...overrides,
  };
}
