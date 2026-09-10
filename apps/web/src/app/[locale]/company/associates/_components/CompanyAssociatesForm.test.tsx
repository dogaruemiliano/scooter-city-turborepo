import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyAssociatesForm } from "./CompanyAssociatesForm";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({
  webApi: { fetch: mocks.apiFetch },
}));

const initialAssociates: v1.finance.CompanyAssociates = {
  managingOwnerId: "owner-1",
  canManage: true,
  items: [
    {
      id: "member-owner",
      associateId: "owner-1",
      associate: {
        id: "owner-1",
        email: "owner@example.com",
        firstName: "Ana",
        lastName: "Popescu",
        displayName: "Ana Popescu",
      },
      shareBasisPoints: 5_000,
      validFrom: "2020-01-01T00:00:00.000Z",
      validUntil: null,
    },
    {
      id: "member-partner",
      associateId: "partner-1",
      associate: {
        id: "partner-1",
        email: "partner@example.com",
        firstName: "Mihai",
        lastName: "Ionescu",
        displayName: "Mihai Ionescu",
      },
      shareBasisPoints: 5_000,
      validFrom: "2020-01-01T00:00:00.000Z",
      validUntil: null,
    },
  ],
};

beforeEach(() => mocks.apiFetch.mockReset());

describe("CompanyAssociatesForm", () => {
  it("lets the founding owner save shares that total 100%", async () => {
    mocks.apiFetch.mockResolvedValue({
      ...initialAssociates,
      items: initialAssociates.items.map((member, index) => ({
        ...member,
        shareBasisPoints: index === 0 ? 6_000 : 4_000,
      })),
    });
    const browser = userEvent.setup();
    renderForm(initialAssociates);

    const shares = screen.getAllByLabelText("Cotă de participare (%)");
    await browser.clear(shares[0]!);
    await browser.type(shares[0]!, "60");
    await browser.clear(shares[1]!);
    await browser.type(shares[1]!, "40");
    await browser.click(
      screen.getByRole("button", { name: "Salvează asociații" }),
    );

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.finance.ROUTES.companyAssociates,
      v1.finance.companyAssociatesSchema,
      {
        method: "PUT",
        json: {
          associates: [
            expect.objectContaining({
              associateId: "owner-1",
              email: "owner@example.com",
              shareBasisPoints: 6_000,
            }),
            expect.objectContaining({
              associateId: "partner-1",
              email: "partner@example.com",
              shareBasisPoints: 4_000,
            }),
          ],
        },
      },
    );
    expect(
      await screen.findByText("Asociații firmei au fost actualizați."),
    ).toBeInTheDocument();
  });

  it("puts the add action first and removes repeated page copy", async () => {
    const browser = userEvent.setup();
    renderForm(initialAssociates);

    expect(
      screen.queryByRole("heading", { name: "Asociații firmei" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Gestionează persoanele care dețin firma/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Doar primul asociat poate modifica asociații/),
    ).not.toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Adaugă asociat" }));

    expect(screen.getAllByLabelText("Adresă de email")).toHaveLength(3);
    expect(screen.getByText("Asociat nou")).toBeInTheDocument();
  });

  it("lets the founding owner edit an existing associate name", async () => {
    mocks.apiFetch.mockResolvedValue(initialAssociates);
    const browser = userEvent.setup();
    renderForm(initialAssociates);

    const firstNames = screen.getAllByLabelText("Prenume");
    await browser.clear(firstNames[1]!);
    await browser.type(firstNames[1]!, "Matei");
    await browser.click(
      screen.getByRole("button", { name: "Salvează asociații" }),
    );

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.finance.ROUTES.companyAssociates,
      v1.finance.companyAssociatesSchema,
      expect.objectContaining({
        json: expect.objectContaining({
          associates: expect.arrayContaining([
            expect.objectContaining({
              associateId: "partner-1",
              firstName: "Matei",
            }),
          ]),
        }),
      }),
    );
  });

  it("lets the founding owner add another associate", async () => {
    mocks.apiFetch.mockResolvedValue(initialAssociates);
    const browser = userEvent.setup();
    renderForm(initialAssociates);

    await browser.click(screen.getByRole("button", { name: "Adaugă asociat" }));

    const firstNames = screen.getAllByLabelText("Prenume");
    const lastNames = screen.getAllByLabelText("Nume");
    const emails = screen.getAllByLabelText("Adresă de email");
    const shares = screen.getAllByLabelText("Cotă de participare (%)");

    await browser.clear(shares[1]!);
    await browser.type(shares[1]!, "25");
    await browser.type(firstNames[2]!, "Irina");
    await browser.type(lastNames[2]!, "Marin");
    await browser.type(emails[2]!, "irina@example.com");
    await browser.type(shares[2]!, "25");
    await browser.click(
      screen.getByRole("button", { name: "Salvează asociații" }),
    );

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.finance.ROUTES.companyAssociates,
      v1.finance.companyAssociatesSchema,
      expect.objectContaining({
        json: expect.objectContaining({
          associates: expect.arrayContaining([
            {
              email: "irina@example.com",
              firstName: "Irina",
              lastName: "Marin",
              shareBasisPoints: 2_500,
            },
          ]),
        }),
      }),
    );
  });

  it("never offers to remove the founding owner", () => {
    renderForm(initialAssociates);

    expect(
      screen.queryByRole("button", { name: "Elimină Ana Popescu" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Elimină Mihai Ionescu" }),
    ).toBeInTheDocument();
  });
});

function renderForm(associates: v1.finance.CompanyAssociates) {
  return render(
    <NextIntlClientProvider locale="ro" messages={messages.ro}>
      <CompanyAssociatesForm initialAssociates={associates} />
    </NextIntlClientProvider>,
  );
}
