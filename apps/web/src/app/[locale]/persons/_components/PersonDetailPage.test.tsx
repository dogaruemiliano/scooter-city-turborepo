import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PersonDetailPage } from "./PersonDetailPage";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

const identityDocument: v1.persons.PersonDocument = {
  id: "document-1",
  personId: "person-1",
  type: "nationalId",
  series: "RR",
  number: "123456",
  cnp: "1900228123450",
  issuingCountryCode: "RO",
  issuedBy: "SPCLEP Bucuresti",
  issuedOn: "2024-01-15",
  expiresOn: "2030-01-31",
  status: "verified",
  notes: "Identity checked at pickup.",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T10:00:00.000Z",
  deletedAt: null,
};

const driverLicenseDocument: v1.persons.PersonDocument = {
  ...identityDocument,
  id: "document-2",
  type: "driverLicense",
  series: "DL",
  number: "654321",
  cnp: null,
  notes: null,
};

const readyPerson: v1.persons.Person = {
  id: "person-1",
  email: "ada@example.com",
  phone: "+40712345678",
  firstName: "Ada",
  lastName: "Lovelace",
  dateOfBirth: "1990-02-28",
  addressLine1: "1 Computation Way",
  addressLine2: null,
  city: "Bucharest",
  region: "București",
  postalCode: "010101",
  countryCode: "RO",
  documents: [identityDocument, driverLicenseDocument],
  notes: "Frequent renter",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T11:00:00.000Z",
  deletedAt: null,
};

const auditEvents: v1.persons.PersonAuditEvent[] = [
  {
    id: "audit-1",
    type: "PERSON_UPDATED",
    personId: "person-1",
    actor: {
      kind: "user",
      userId: "user-1",
      email: "admin@example.com",
      name: null,
    },
    document: null,
    replacement: null,
    changes: [
      {
        field: "phone",
        oldValue: "+40700000000",
        newValue: "+40712345678",
      },
    ],
    createdAt: "2026-06-25T12:00:00.000Z",
  },
];

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  mocks.replace.mockReset();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("PersonDetailPage", () => {
  it("renders profile details, documents, and masked sensitive fields", () => {
    renderDetail();

    expect(
      screen.getByRole("link", { name: "Back to persons" }),
    ).toHaveAttribute("href", "/en/persons");
    expect(
      screen.getByRole("heading", { name: "Ada Lovelace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("+40712345678")).toBeInTheDocument();
    expect(screen.getByText("Frequent renter")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("National ID")).toBeInTheDocument();
    expect(screen.getByText("Driver license")).toBeInTheDocument();
    expect(screen.getByText("RR")).toBeInTheDocument();
    expect(screen.getByText("****3456")).toBeInTheDocument();
    expect(screen.getByText("*********3450")).toBeInTheDocument();
    expect(screen.queryByText("123456")).not.toBeInTheDocument();
    expect(screen.queryByText("1900228123450")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit person" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add document" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "More actions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Activity" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Person updated")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
  });

  it("updates the person from the edit dialog", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...readyPerson,
      firstName: "Grace",
    });
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(screen.getByRole("button", { name: "Edit person" }));
    const dialog = await screen.findByRole("dialog");
    await browser.clear(within(dialog).getByLabelText("First name"));
    await browser.type(within(dialog).getByLabelText("First name"), "Grace");
    await browser.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.persons.ROUTES.update(readyPerson.id),
        v1.persons.personSchema,
        expect.objectContaining({
          method: "PATCH",
          json: expect.objectContaining({ firstName: "Grace" }),
        }),
      ),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("soft-deletes documents and the person with confirmation", async () => {
    mocks.apiFetch.mockResolvedValue(undefined);
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(
      screen.getAllByRole("button", { name: "Delete document" })[0],
    );
    let dialog = await screen.findByRole("dialog");
    await browser.click(
      within(dialog).getByRole("button", { name: "Delete document" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.persons.ROUTES.documents.delete(readyPerson.id, identityDocument.id),
        v1.common.noContentSchema,
        { method: "DELETE" },
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Delete person"));
    dialog = await screen.findByRole("dialog");
    await browser.click(
      within(dialog).getByRole("button", { name: "Delete person" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.persons.ROUTES.delete(readyPerson.id),
        v1.common.noContentSchema,
        { method: "DELETE" },
      ),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/en/persons");
  });

  it("renders deleted and empty document states", () => {
    renderDetail({
      ...readyPerson,
      documents: [],
      notes: null,
      deletedAt: "2026-06-26T10:00:00.000Z",
    });

    expect(screen.getAllByText("Deleted").length).toBeGreaterThan(0);
    expect(
      screen.getByText("No documents are attached to this person."),
    ).toBeInTheDocument();
    expect(screen.getByText("Missing identity document.")).toBeInTheDocument();
    expect(screen.getByText("Missing driver license.")).toBeInTheDocument();
    expect(screen.getAllByText("Not provided").length).toBeGreaterThan(0);
  });

  it.each([
    {
      name: "missing required document",
      documents: [identityDocument],
      expected: "Missing driver license.",
    },
    {
      name: "expired document",
      documents: [
        { ...identityDocument, expiresOn: "2020-01-01" },
        driverLicenseDocument,
      ],
      expected: "A document is expired.",
    },
    {
      name: "rejected document",
      documents: [
        { ...identityDocument, status: "rejected" as const },
        driverLicenseDocument,
      ],
      expected: "A document was rejected.",
    },
    {
      name: "unverified document",
      documents: [
        { ...identityDocument, status: "unverified" as const },
        driverLicenseDocument,
      ],
      expected: "A document is waiting for verification.",
    },
  ])("renders readiness issue for $name", ({ documents, expected }) => {
    renderDetail({ ...readyPerson, documents });

    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("renders Romanian detail copy", () => {
    renderDetail(readyPerson, "ro");

    expect(
      screen.getByRole("link", { name: "Înapoi la persoane" }),
    ).toHaveAttribute("href", "/persons");
    expect(screen.getByText("Pregătită")).toBeInTheDocument();
    expect(screen.getByText("Carte de identitate")).toBeInTheDocument();
  });
});

function renderDetail(
  person: v1.persons.Person = readyPerson,
  locale: SupportedLocale = "en",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <PersonDetailPage
        person={person}
        auditEvents={auditEvents}
        personsHref={locale === "en" ? "/en/persons" : "/persons"}
      />
    </NextIntlClientProvider>,
  );
}
