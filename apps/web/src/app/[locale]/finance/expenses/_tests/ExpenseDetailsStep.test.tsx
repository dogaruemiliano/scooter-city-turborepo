import { messages } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useReducer } from "react";
import { describe, expect, it, vi } from "vitest";

import { ExpenseDetailsStep } from "../_components/ExpenseDetailsStep";
import {
  createExpenseFormState,
  expenseFormReducer,
} from "../_lib/expense-form";
import type { ExpenseFormBootstrap } from "../_lib/expense-options";

vi.mock("../_components/ExpenseCounterpartySelect", () => ({
  ExpenseCounterpartySelect: () => <div>Payee field</div>,
}));

vi.mock("../_components/ExpenseScooterAllocationEditor", () => ({
  ExpenseScooterAllocationEditor: () => <div>Scooter allocation field</div>,
}));

describe("ExpenseDetailsStep quick classification", () => {
  it("autofocuses the amount and keeps dependent controls hidden initially", () => {
    renderStep();

    expect(screen.getByLabelText(/Gross amount/)).toHaveFocus();
    expect(
      screen.queryByText(
        "This answer determines the source of funds and the evidence required.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("*").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("group", { name: "Payment method" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", {
        name: "Real beneficiary / Expense for",
      }),
    ).not.toBeInTheDocument();
  });

  it("reveals company payment and beneficiary controls after Yes", async () => {
    const browser = userEvent.setup();
    renderStep();

    await browser.click(screen.getByRole("button", { name: "Yes" }));

    expect(
      screen.getByRole("group", { name: "Payment method" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Company card" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("group", {
        name: "Real beneficiary / Expense for",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Company wallet")).toBeInTheDocument();
    expect(screen.getByText("JUSEM bank")).toBeInTheDocument();
    expect(
      screen.queryByText("Included in the company's operating P&L."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Attributed to this associate and excluded from operating P&L.",
      ),
    ).not.toBeInTheDocument();
  });

  it("forces personal funds, current payer, and company attribution after No", async () => {
    const browser = userEvent.setup();
    renderStep();

    await browser.click(screen.getByRole("button", { name: "No" }));

    expect(screen.getByText("Personal funds")).toBeInTheDocument();
    expect(screen.getByTestId("payment-source")).toHaveTextContent(
      "PERSONAL_FUNDS",
    );
    expect(screen.getByTestId("attribution-target")).toHaveTextContent(
      "BUSINESS",
    );
    expect(screen.getByTestId("funder")).toHaveTextContent("user-1");
    expect(screen.getByTestId("payer")).toHaveTextContent("user-1");
    expect(
      screen.queryByRole("group", { name: "Payment method" }),
    ).not.toBeInTheDocument();
  });

  it("requires a choice when more than one compatible company wallet exists", async () => {
    const browser = userEvent.setup();
    renderStep({
      ...bootstrap,
      entities: [
        {
          ...bootstrap.entities[0]!,
          wallets: [
            ...bootstrap.entities[0]!.wallets,
            {
              id: "wallet-2",
              name: "JUSEM second bank",
              type: "COMPANY_BANK",
            },
          ],
        },
      ],
    });

    await browser.click(screen.getByRole("button", { name: "Yes" }));

    expect(
      screen.getByRole("combobox", { name: /Company card/ }),
    ).toHaveTextContent("Select company wallet");
    expect(
      screen.getByRole("combobox", { name: /Company card/ }),
    ).toHaveAttribute("aria-required", "true");
    expect(screen.getByTestId("company-wallet")).toBeEmptyDOMElement();
  });

  it("exposes the primary required fields programmatically", async () => {
    const browser = userEvent.setup();
    renderStep();

    expect(screen.getByLabelText(/Gross amount/)).toBeRequired();
    expect(
      screen.getByRole("group", { name: /Did you add the company CUI/ }),
    ).toHaveAttribute("aria-required", "true");

    await browser.click(screen.getByRole("button", { name: "Yes" }));

    expect(
      document.querySelector('input[type="hidden"][name="expense-date"]'),
    ).toHaveAttribute("required");
    expect(screen.getByLabelText(/Category/)).toHaveAttribute(
      "aria-required",
      "true",
    );

    await browser.click(screen.getByRole("button", { name: "Associate" }));
    expect(screen.getByLabelText(/Specific owner/)).toHaveAttribute(
      "aria-required",
      "true",
    );
  });

  it("shows actionable setup guidance when categories or wallets are missing", async () => {
    const browser = userEvent.setup();
    renderStep({
      ...bootstrap,
      categories: [],
      entities: [{ ...bootstrap.entities[0]!, wallets: [] }],
    });

    await browser.click(screen.getByRole("button", { name: "Yes" }));

    expect(screen.getByText("No expense categories available")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Manage categories" }),
    ).toHaveAttribute("href", "/en/finance/categories");
    expect(screen.getByText("No compatible company wallet")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open business settings" }),
    ).toHaveAttribute("href", "/en/finance/settings/business");
  });
});

function ExpenseDetailsHarness({ data }: { data: ExpenseFormBootstrap }) {
  const [state, dispatch] = useReducer(
    expenseFormReducer,
    createExpenseFormState({
      currentUserId: data.currentUserId,
      defaultBusinessEntityId: "entity-1",
      defaultCurrency: "RON",
      today: data.today,
    }),
  );

  return (
    <>
      <ExpenseDetailsStep
        bootstrap={data}
        categoriesHref="/en/finance/categories"
        disabled={false}
        dispatch={dispatch}
        errors={{}}
        onBusinessEntityChange={(businessEntityId, currency) =>
          dispatch({ type: "SET_BUSINESS_ENTITY", businessEntityId, currency })
        }
        onCompanyCuiAnswerChange={(value) =>
          dispatch({
            type: "SET_COMPANY_CUI_ANSWER",
            value,
            currentUserId: data.currentUserId,
          })
        }
        settingsHref="/en/finance/settings/business"
        state={state}
      />
      <output data-testid="payment-source">{state.paymentSource}</output>
      <output data-testid="attribution-target">
        {state.attributionTarget}
      </output>
      <output data-testid="funder">{state.fundedByUserId}</output>
      <output data-testid="payer">{state.paidByUserId}</output>
      <output data-testid="company-wallet">{state.companyWalletId}</output>
    </>
  );
}

function renderStep(data: ExpenseFormBootstrap = bootstrap) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ExpenseDetailsHarness data={data} />
    </NextIntlClientProvider>,
  );
}

const bootstrap: ExpenseFormBootstrap = {
  entities: [
    {
      id: "entity-1",
      label: "JUSEM HUB SRL",
      taxIdentifier: "RO12345678",
      defaultCurrency: "RON",
      wallets: [
        { id: "wallet-1", name: "JUSEM bank", type: "COMPANY_BANK" },
        { id: "cash-1", name: "JUSEM cash", type: "COMPANY_CASH" },
      ],
    },
  ],
  users: [{ id: "user-1", label: "Ada Lovelace", email: "ada@example.com" }],
  owners: [
    {
      id: "owner-1",
      legalEntityId: "entity-1",
      userId: "user-1",
      label: "Ada Lovelace",
      email: "ada@example.com",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    },
  ],
  categories: [{ id: "category-1", label: "Fuel" }],
  vatPeriods: [],
  currentUserId: "user-1",
  today: "2026-08-01",
};
