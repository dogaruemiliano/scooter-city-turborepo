import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyCreateForm } from "./CompanyCreateForm";

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

describe("CompanyCreateForm", () => {
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
});

function renderCreateForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <CompanyCreateForm companiesHref="/en/finance/companies" />
    </NextIntlClientProvider>,
  );
}
