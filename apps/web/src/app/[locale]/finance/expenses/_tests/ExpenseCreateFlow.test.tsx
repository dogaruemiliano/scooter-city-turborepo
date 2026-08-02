import { messages } from "@repo/i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExpenseCreateFlow } from "../_components/ExpenseCreateFlow";
import { ExpenseCompletionPendingError } from "../_lib/expense-api";
import type { SelectedExpenseEvidence } from "../_lib/expense-api";
import type { ExpenseFormAction, ExpenseFormState } from "../_lib/expense-form";
import type { ExpenseFormBootstrap } from "../_lib/expense-options";

const mocks = vi.hoisted(() => ({
  buildPayload: vi.fn(),
  detailsErrors: {} as Record<string, string>,
  evidenceErrors: {} as Record<string, string>,
  push: vi.fn(),
  recordExpense: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/lib/api", () => ({
  webApi: { fetch: vi.fn() },
}));

vi.mock("../_lib/expense-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_lib/expense-api")>();
  return { ...actual, recordExpense: mocks.recordExpense };
});

vi.mock("../_lib/expense-form", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_lib/expense-form")>();
  return {
    ...actual,
    buildCompactExpensePayload: mocks.buildPayload,
    hasExpenseFormErrors: (errors: Record<string, string>) =>
      Object.values(errors).some(Boolean),
    validateExpenseDetails: () => mocks.detailsErrors,
    validateExpenseEvidence: () => mocks.evidenceErrors,
  };
});

vi.mock("../_components/ExpenseDetailsStep", () => ({
  ExpenseDetailsStep: ({
    disabled,
    dispatch,
    errors,
    onBusinessEntityChange,
    onCompanyCuiAnswerChange,
  }: {
    disabled: boolean;
    dispatch(action: ExpenseFormAction): void;
    errors: { grossAmount?: string; hasCompanyCui?: string };
    onBusinessEntityChange(businessEntityId: string, currency: string): void;
    onCompanyCuiAnswerChange(answer: "YES" | "NO"): void;
  }) => (
    <>
      <input
        aria-label="Gross amount test field"
        aria-invalid={Boolean(errors.grossAmount)}
        disabled={disabled}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onCompanyCuiAnswerChange("YES")}
      >
        Company CUI yes
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onCompanyCuiAnswerChange("NO")}
      >
        Company CUI no
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onBusinessEntityChange("entity-2", "EUR")}
      >
        Change company
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          dispatch({ type: "SET_FIELD", field: "grossAmount", value: "100" })
        }
      >
        Correct amount
      </button>
      {errors.hasCompanyCui ? <p>{errors.hasCompanyCui}</p> : null}
      {errors.grossAmount ? <p>{errors.grossAmount}</p> : null}
    </>
  ),
}));

vi.mock("../_components/ExpenseEvidenceStep", () => ({
  ExpenseEvidenceStep: ({
    disabled,
    dispatch,
    fiscalEvidence,
    onFiscalEvidenceChange,
    onFiscalProcessingChange,
    onPosEvidenceChange,
    onPosProcessingChange,
    posEvidence,
    state,
  }: {
    disabled: boolean;
    dispatch(action: ExpenseFormAction): void;
    fiscalEvidence: SelectedExpenseEvidence | null;
    onFiscalEvidenceChange(value: SelectedExpenseEvidence | null): void;
    onFiscalProcessingChange(processing: boolean): void;
    onPosEvidenceChange(value: SelectedExpenseEvidence | null): void;
    onPosProcessingChange(processing: boolean): void;
    posEvidence: SelectedExpenseEvidence | null;
    state: ExpenseFormState;
  }) => (
    <>
      <button type="button" disabled={disabled}>
        Evidence editor
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onFiscalEvidenceChange({
            file: new File(["fiscal"], "fiscal.pdf", {
              type: "application/pdf",
            }),
            fileName: "fiscal.pdf",
            contentType: "application/pdf",
            byteSize: 6,
            sha256: "a".repeat(64),
          })
        }
      >
        Attach fiscal
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onPosEvidenceChange({
            file: new File(["pos"], "pos.jpg", { type: "image/jpeg" }),
            fileName: "pos.jpg",
            contentType: "image/jpeg",
            byteSize: 3,
            sha256: "b".repeat(64),
          })
        }
      >
        Attach POS
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onFiscalEvidenceChange(null)}
      >
        Clear fiscal
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          dispatch({
            type: "SET_FIELD",
            field: "documentType",
            value: "INVOICE",
          });
          dispatch({
            type: "SET_FIELD",
            field: "documentNumber",
            value: "OLD-1",
          });
          dispatch({
            type: "SET_FIELD",
            field: "documentDate",
            value: "2026-07-31",
          });
          dispatch({ type: "ADD_VAT_LINE", id: "vat-old" });
        }}
      >
        Seed fiscal assertions
      </button>
      <button type="button" onClick={() => onFiscalProcessingChange(true)}>
        Start fiscal preparation
      </button>
      <button
        type="button"
        onClick={() => {
          onFiscalProcessingChange(true);
          onPosProcessingChange(true);
        }}
      >
        Start both preparations
      </button>
      <button type="button" onClick={() => onFiscalProcessingChange(false)}>
        Finish fiscal preparation
      </button>
      <button type="button" onClick={() => onPosProcessingChange(false)}>
        Finish POS preparation
      </button>
      <output data-testid="fiscal-file">{fiscalEvidence?.fileName}</output>
      <output data-testid="pos-file">{posEvidence?.fileName}</output>
      <output data-testid="document-type">{state.documentType}</output>
      <output data-testid="document-number">{state.documentNumber}</output>
      <output data-testid="vat-count">{state.vatLines.length}</output>
    </>
  ),
}));

beforeEach(() => {
  mocks.buildPayload.mockReset();
  mocks.push.mockReset();
  mocks.recordExpense.mockReset();
  mocks.refresh.mockReset();
  mocks.detailsErrors = {};
  mocks.evidenceErrors = {};
  mocks.buildPayload.mockReturnValue({ idempotencyKey: "expense-key-1" });
  mocks.recordExpense.mockResolvedValue({ id: "expense-1" });
});

describe("ExpenseCreateFlow recovery", () => {
  it("uses the app shell title and navigation without local duplicates", () => {
    renderFlow();

    expect(
      screen.queryByRole("heading", { name: "Add expense" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Back to expenses" }),
    ).not.toBeInTheDocument();
  });

  it("freezes the form and retries the exact saved submission snapshot", async () => {
    const browser = userEvent.setup();
    mocks.recordExpense
      .mockRejectedValueOnce(
        new ExpenseCompletionPendingError(
          "expense-1",
          "EVIDENCE_UPLOAD",
          new Error("upload failed"),
        ),
      )
      .mockResolvedValueOnce({ id: "expense-1" });
    renderFlow();

    await browser.click(
      screen.getByRole("button", { name: "Company CUI yes" }),
    );
    await browser.click(screen.getByRole("button", { name: "Record expense" }));

    expect(
      await screen.findByText(
        /Draft expense-1 is saved, but completion did not finish/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Evidence editor" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Gross amount test field")).toBeDisabled();

    await browser.click(
      screen.getByRole("button", { name: "Retry completion" }),
    );
    await waitFor(() => expect(mocks.recordExpense).toHaveBeenCalledTimes(2));

    const firstCall = mocks.recordExpense.mock.calls[0];
    const retryCall = mocks.recordExpense.mock.calls[1];
    expect(retryCall?.[0]).toBe(firstCall?.[0]);
    expect(retryCall?.[1]).toBe(firstCall?.[1]);
    expect(mocks.push).toHaveBeenCalledWith("/en/finance/expenses");
  });

  it("focuses the first invalid control after validation", async () => {
    const browser = userEvent.setup();
    mocks.detailsErrors = { grossAmount: "Required" };
    renderFlow();

    await browser.click(screen.getByRole("button", { name: "Record expense" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Gross amount test field")).toHaveFocus(),
    );
  });

  it("blocks a company-CUI expense when the selected company has no CUI", async () => {
    const browser = userEvent.setup();
    renderFlow({
      ...bootstrap,
      entities: [{ ...bootstrap.entities[0]!, taxIdentifier: null }],
    });

    await browser.click(
      screen.getByRole("button", { name: "Company CUI yes" }),
    );
    await browser.click(screen.getByRole("button", { name: "Record expense" }));

    expect(
      await screen.findByText(/selected company has no CUI configured/i),
    ).toBeInTheDocument();
    expect(mocks.recordExpense).not.toHaveBeenCalled();
  });

  it("keeps submission blocked until both evidence preparations finish", async () => {
    const browser = userEvent.setup();
    renderFlow();

    await browser.click(
      screen.getByRole("button", { name: "Company CUI yes" }),
    );
    await browser.click(
      screen.getByRole("button", { name: "Start both preparations" }),
    );

    expect(
      screen.getByRole("button", { name: /Preparing and checking/ }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Gross amount test field")).toBeDisabled();
    expect(document.querySelector("form")).toHaveAttribute("aria-busy", "true");

    await browser.click(
      screen.getByRole("button", { name: "Finish fiscal preparation" }),
    );
    expect(
      screen.getByRole("button", { name: /Preparing and checking/ }),
    ).toBeDisabled();

    fireEvent.submit(document.querySelector("form")!);
    expect(
      await screen.findByText(/Wait until every selected document/),
    ).toBeVisible();
    expect(mocks.buildPayload).not.toHaveBeenCalled();

    await browser.click(
      screen.getByRole("button", { name: "Finish POS preparation" }),
    );
    expect(
      screen.getByRole("button", { name: "Record expense" }),
    ).toBeEnabled();
    expect(document.querySelector("form")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });

  it("also blocks an optional no-CUI document while it is preparing", async () => {
    const browser = userEvent.setup();
    renderFlow();

    await browser.click(screen.getByRole("button", { name: "Company CUI no" }));
    await browser.click(
      screen.getByRole("button", { name: "Start fiscal preparation" }),
    );

    expect(
      screen.getByRole("button", { name: /Preparing and checking/ }),
    ).toBeDisabled();
    fireEvent.submit(document.querySelector("form")!);
    expect(
      await screen.findByText(/Wait until every selected document/),
    ).toBeVisible();
    expect(mocks.buildPayload).not.toHaveBeenCalled();

    await browser.click(
      screen.getByRole("button", { name: "Finish fiscal preparation" }),
    );
    expect(
      screen.getByRole("button", { name: "Record expense" }),
    ).toBeEnabled();
  });

  it("resets fiscal assertions and POS proof when the fiscal file is replaced", async () => {
    const browser = userEvent.setup();
    renderFlow();

    await browser.click(
      screen.getByRole("button", { name: "Company CUI yes" }),
    );
    await browser.click(screen.getByRole("button", { name: "Attach fiscal" }));
    await browser.click(screen.getByRole("button", { name: "Attach POS" }));
    await browser.click(
      screen.getByRole("button", { name: "Seed fiscal assertions" }),
    );

    await browser.click(screen.getByRole("button", { name: "Attach fiscal" }));

    expect(screen.getByTestId("fiscal-file")).toHaveTextContent("fiscal.pdf");
    expect(screen.getByTestId("pos-file")).toBeEmptyDOMElement();
    expect(screen.getByTestId("document-type")).toHaveTextContent(
      "FISCAL_RECEIPT",
    );
    expect(screen.getByTestId("document-number")).toBeEmptyDOMElement();
    expect(screen.getByTestId("vat-count")).toHaveTextContent("0");
  });

  it("removes stale files, document assertions, and VAT when CUI changes", async () => {
    const browser = userEvent.setup();
    renderFlow();

    await browser.click(
      screen.getByRole("button", { name: "Company CUI yes" }),
    );
    await browser.click(screen.getByRole("button", { name: "Attach fiscal" }));
    await browser.click(screen.getByRole("button", { name: "Attach POS" }));
    await browser.click(
      screen.getByRole("button", { name: "Seed fiscal assertions" }),
    );

    expect(screen.getByTestId("fiscal-file")).toHaveTextContent("fiscal.pdf");
    expect(screen.getByTestId("pos-file")).toHaveTextContent("pos.jpg");
    expect(screen.getByTestId("document-number")).toHaveTextContent("OLD-1");
    expect(screen.getByTestId("vat-count")).toHaveTextContent("1");

    await browser.click(screen.getByRole("button", { name: "Company CUI no" }));

    expect(screen.getByTestId("fiscal-file")).toBeEmptyDOMElement();
    expect(screen.getByTestId("pos-file")).toBeEmptyDOMElement();
    expect(screen.getByTestId("document-type")).toHaveTextContent(
      "FISCAL_RECEIPT",
    );
    expect(screen.getByTestId("document-number")).toBeEmptyDOMElement();
    expect(screen.getByTestId("vat-count")).toHaveTextContent("0");

    await browser.click(screen.getByRole("button", { name: "Record expense" }));
    const [submittedState, options] = mocks.buildPayload.mock.calls.at(-1)!;
    expect(submittedState).toMatchObject({
      hasCompanyCui: "NO",
      documentType: "FISCAL_RECEIPT",
      documentNumber: "",
      documentDate: "",
      vatLines: [],
    });
    expect(options).toMatchObject({ fiscalEvidence: null, posEvidence: null });
  });

  it("removes stale evidence and assertions when the legal entity changes", async () => {
    const browser = userEvent.setup();
    renderFlow({
      ...bootstrap,
      entities: [
        ...bootstrap.entities,
        {
          ...bootstrap.entities[0]!,
          id: "entity-2",
          label: "Second company",
          taxIdentifier: "RO456",
          defaultCurrency: "EUR",
        },
      ],
    });

    await browser.click(
      screen.getByRole("button", { name: "Company CUI yes" }),
    );
    await browser.click(screen.getByRole("button", { name: "Attach fiscal" }));
    await browser.click(screen.getByRole("button", { name: "Attach POS" }));
    await browser.click(
      screen.getByRole("button", { name: "Seed fiscal assertions" }),
    );
    await browser.click(screen.getByRole("button", { name: "Change company" }));

    expect(screen.getByTestId("fiscal-file")).toBeEmptyDOMElement();
    expect(screen.getByTestId("pos-file")).toBeEmptyDOMElement();
    expect(screen.getByTestId("document-type")).toHaveTextContent(
      "FISCAL_RECEIPT",
    );
    expect(screen.getByTestId("document-number")).toBeEmptyDOMElement();
    expect(screen.getByTestId("vat-count")).toHaveTextContent("0");
  });

  it("clears field errors as the user corrects them", async () => {
    const browser = userEvent.setup();
    mocks.detailsErrors = { grossAmount: "Required" };
    renderFlow();

    await browser.click(screen.getByRole("button", { name: "Record expense" }));
    expect(screen.getByText("Required")).toBeVisible();

    await browser.click(screen.getByRole("button", { name: "Correct amount" }));
    expect(screen.queryByText("Required")).not.toBeInTheDocument();
  });
});

function renderFlow(data: ExpenseFormBootstrap = bootstrap) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ExpenseCreateFlow
        advancedTransactionHref="/en/finance/transactions/new"
        bootstrap={data}
        categoriesHref="/en/finance/categories"
        expensesHref="/en/finance/expenses"
        idempotencyKey="expense-key-1"
        settingsHref="/en/finance/settings/business"
      />
    </NextIntlClientProvider>,
  );
}

const bootstrap: ExpenseFormBootstrap = {
  entities: [
    {
      id: "entity-1",
      label: "Scooter City SRL",
      taxIdentifier: "RO123",
      defaultCurrency: "RON",
      wallets: [{ id: "wallet-1", name: "Company card", type: "COMPANY_BANK" }],
    },
  ],
  users: [{ id: "user-1", label: "Ada Lovelace", email: "ada@example.com" }],
  owners: [],
  categories: [{ id: "category-1", label: "Fuel" }],
  vatPeriods: [],
  currentUserId: "user-1",
  today: "2026-08-01",
};
