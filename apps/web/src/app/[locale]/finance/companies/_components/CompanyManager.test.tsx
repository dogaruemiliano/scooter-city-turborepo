import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyManager } from "./CompanyManager";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
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

function renderCompanyManager() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <CompanyManager
        companies={[company]}
        companiesHref="/en/finance/companies"
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("CompanyManager", () => {
  it("provides a desktop table and a compact mobile company card", () => {
    renderCompanyManager();
    const desktopTable = screen.getByRole("table");
    const mobileList = screen.getByRole("list");
    const mobileCard = within(mobileList).getByRole("listitem");

    expect(desktopTable.parentElement?.parentElement).toHaveClass(
      "hidden",
      "md:block",
    );
    expect(mobileList).toHaveClass("md:hidden");
    expect(mobileCard).toHaveClass("overflow-hidden");
    expect(
      within(mobileCard).getByText("Scooter City Operations SRL"),
    ).toHaveClass("truncate");
    expect(within(mobileCard).getByText(/RO12345678/)).toBeVisible();
    expect(
      within(mobileCard).getByRole("link", {
        name: /Scooter City Operations SRL/,
      }),
    ).toHaveAttribute("href", "/en/finance/companies/company-1");
    expect(within(mobileCard).queryByRole("switch")).not.toBeInTheDocument();
    expect(
      within(mobileCard).queryByRole("button", { name: /Edit company/ }),
    ).not.toBeInTheDocument();
  });

  it("uses a distinct community icon for an NGO", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <CompanyManager
          companies={[{ ...company, legalForm: "ONG" }]}
          companiesHref="/en/finance/companies"
        />
      </NextIntlClientProvider>,
    );

    expect(container.querySelector(".lucide-heart-handshake")).not.toBeNull();
  });

  it("links to the create page instead of opening a dialog", () => {
    renderCompanyManager();

    expect(screen.getByRole("link", { name: "Add company" })).toHaveAttribute(
      "href",
      "/en/finance/companies/new",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
