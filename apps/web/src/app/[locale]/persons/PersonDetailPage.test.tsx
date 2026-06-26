import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { PersonDetailPage } from "./PersonDetailPage";

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
    expect(screen.getByText("*********3456")).toBeInTheDocument();
    expect(screen.queryByText("123456")).not.toBeInTheDocument();
    expect(screen.queryByText("1900228123450")).not.toBeInTheDocument();
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
        personsHref={locale === "en" ? "/en/persons" : "/persons"}
      />
    </NextIntlClientProvider>,
  );
}
