import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyForm } from "./CompanyForm";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    push: mocks.push,
  }),
}));

const company: v1.finance.Company = {
  id: "company-1",
  counterpartyId: "counterparty-1",
  businessLegalEntityId: null,
  legalName: "Scooter City Operations SRL",
  legalForm: "SRL",
  tradingName: "Scooter City",
  taxIdentifier: "RO12345678",
  registrationNumber: "J40/1234/2026",
  email: "operations@scooter-city.example.com",
  phone: "+40700111222",
  addressLine1: "Strada Exemplu 1",
  addressLine2: null,
  city: "București",
  region: null,
  postalCode: null,
  countryCode: "RO",
  notes: null,
  isActive: true,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  mocks.push.mockReset();
});

describe("CompanyForm", () => {
  it("creates a company with the shared international phone input", async () => {
    mocks.apiFetch.mockResolvedValueOnce(company);
    const browser = userEvent.setup();

    renderCreateForm();

    expect(screen.getByLabelText("Phone country")).toHaveValue("RO");
    expect(screen.getByLabelText("Phone")).toHaveAttribute(
      "placeholder",
      "Phone",
    );

    await browser.type(
      screen.getByLabelText("Legal name"),
      "Example Company SRL",
    );
    await browser.type(screen.getByLabelText("Phone"), "700111222");
    await browser.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.finance.ROUTES.companies.create,
        v1.finance.companySchema,
        expect.objectContaining({
          method: "POST",
          json: expect.objectContaining({
            legalName: "Example Company SRL",
            phone: "+40700111222",
          }),
        }),
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/finance/companies");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("prefills every field when editing", () => {
    renderEditForm();

    expect(screen.getByLabelText("Legal name")).toHaveValue(company.legalName);
    expect(screen.getByLabelText("Trading name")).toHaveValue(
      company.tradingName,
    );
    expect(screen.getByLabelText("Tax identifier")).toHaveValue(
      company.taxIdentifier,
    );
    expect(screen.getByLabelText("Registration number")).toHaveValue(
      company.registrationNumber,
    );
    expect(screen.getByLabelText("Email")).toHaveValue(company.email);
    expect(screen.getByLabelText("Phone")).toHaveValue("700111222");
    expect(screen.getByLabelText("Phone country")).toHaveValue("RO");
    expect(screen.getByLabelText("Address")).toHaveValue(company.addressLine1);
    expect(screen.getByLabelText("City")).toHaveValue(company.city);
    expect(screen.getByLabelText("Country code")).toHaveValue(
      company.countryCode,
    );
  });

  it("PATCHes the edited company and returns to its detail page", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ...company, city: "Cluj" });
    const browser = userEvent.setup();

    renderEditForm();
    await browser.clear(screen.getByLabelText("City"));
    await browser.type(screen.getByLabelText("City"), "Cluj");
    await browser.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.finance.ROUTES.companies.update(company.id),
        v1.finance.companySchema,
        expect.objectContaining({
          method: "PATCH",
          json: expect.objectContaining({
            legalName: company.legalName,
            city: "Cluj",
          }),
        }),
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith(
      `/en/finance/companies/${company.id}`,
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});

function renderEditForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <CompanyForm
        company={company}
        cancelHref={`/en/finance/companies/${company.id}`}
      />
    </NextIntlClientProvider>,
  );
}

function renderCreateForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <CompanyForm cancelHref="/en/finance/companies" />
    </NextIntlClientProvider>,
  );
}
