import { messages } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { BusinessSetupBootstrap } from "../../../expenses/_lib/expense-server";
import { BusinessSetupForm } from "./BusinessSetupForm";

vi.mock("@/lib/api", () => ({
  webApi: { fetch: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("BusinessSetupForm", () => {
  it("manages a scheduled VAT period without offering an overlapping new period", async () => {
    const browser = userEvent.setup();
    renderForm({
      ...emptyBootstrap,
      entities: [
        {
          id: "entity-1",
          label: "Scooter City SRL",
          taxIdentifier: "RO123",
          defaultCurrency: "RON",
          wallets: [],
        },
      ],
      owners: [
        {
          id: "owner-period-1",
          legalEntityId: "entity-1",
          userId: "user-1",
          label: "Ada Lovelace",
          email: "ada@example.com",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
        },
      ],
      users: [
        {
          id: "user-1",
          label: "Ada Lovelace",
          email: "ada@example.com",
        },
        {
          id: "user-2",
          label: "Grace Hopper",
          email: "grace@example.com",
        },
      ],
      vatPeriods: [
        {
          id: "vat-period-1",
          legalEntityId: "entity-1",
          countryCode: "RO",
          vatNumber: "RO123",
          effectiveFrom: "2026-09-01",
          effectiveTo: null,
        },
      ],
    });

    expect(
      screen.getByRole("button", { name: "Update scheduled registration" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start VAT registration" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "End owner period" }),
    ).toBeInTheDocument();

    await browser.click(
      screen.getByRole("button", { name: "End owner period" }),
    );

    expect(
      screen.getByRole("button", { name: "End owner period" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Owner period ends on (exclusive)"),
    ).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Cancel" }));

    await browser.click(screen.getByRole("button", { name: "Add owner" }));

    expect(
      screen.getByRole("button", { name: "Add owner period" }),
    ).toBeInTheDocument();
  });

  it("uses separate owner and VAT effective-date controls initially", async () => {
    const browser = userEvent.setup();
    renderForm(emptyBootstrap);

    const ownerDay = screen.getByLabelText("Owner effective from");
    await browser.click(
      screen.getByRole("checkbox", {
        name: "The company is VAT registered",
      }),
    );
    const vatDay = screen.getByLabelText("VAT effective from");

    expect(ownerDay).not.toBe(vatDay);
    expect(ownerDay).toHaveValue("01");
    expect(screen.getByLabelText("Owner effective from MM")).toHaveValue("08");
    expect(screen.getByLabelText("Owner effective from YYYY")).toHaveValue(
      "2026",
    );
    expect(vatDay).toHaveValue("01");
    expect(screen.getByLabelText("VAT effective from MM")).toHaveValue("08");
    expect(screen.getByLabelText("VAT effective from YYYY")).toHaveValue(
      "2026",
    );
  });

  it("starts with the cash desk and lets the user add card accounts", async () => {
    const browser = userEvent.setup();
    renderForm(emptyBootstrap);

    expect(screen.getByText("Cash desk")).toBeInTheDocument();
    expect(screen.getByText("Included")).toBeInTheDocument();

    await browser.click(
      screen.getByRole("button", { name: "Add card account" }),
    );

    expect(screen.getByLabelText("Account or card name")).toBeRequired();
    expect(screen.getByLabelText("Card holder")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove account" }),
    ).toBeInTheDocument();
  });
});

function renderForm(bootstrap: BusinessSetupBootstrap) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <BusinessSetupForm
        bootstrap={bootstrap}
        newExpenseHref="/en/finance/expenses/new"
      />
    </NextIntlClientProvider>,
  );
}

const emptyBootstrap: BusinessSetupBootstrap = {
  companies: [],
  entities: [],
  owners: [],
  vatPeriods: [],
  users: [],
  usersNextCursor: null,
  today: "2026-08-01",
};
