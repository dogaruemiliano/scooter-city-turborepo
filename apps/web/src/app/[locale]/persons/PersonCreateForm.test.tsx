import { ApiError, v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PersonCreateForm } from "./PersonCreateForm";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../../lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

const createdPerson: v1.persons.Person = {
  id: "person-2",
  email: "rider@example.com",
  phone: "+40749096855",
  firstName: "Grace",
  lastName: "Hopper",
  dateOfBirth: "1990-02-28",
  addressLine1: "1 Rental Street",
  addressLine2: "Apt 4",
  city: "Bucharest",
  region: "București",
  postalCode: "010101",
  countryCode: "RO",
  documents: [
    {
      id: "document-1",
      personId: "person-2",
      type: "nationalId",
      series: "RX",
      number: "123456",
      cnp: "1900228123450",
      issuingCountryCode: "RO",
      issuedBy: "SPCLEP Bucuresti",
      issuedOn: "2024-01-15",
      expiresOn: "2030-01-31",
      status: "unverified",
      notes: null,
      createdAt: "2026-06-25T10:00:00.000Z",
      updatedAt: "2026-06-25T10:00:00.000Z",
      deletedAt: null,
    },
  ],
  notes: "Frequent rider",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T10:00:00.000Z",
  deletedAt: null,
};

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.push.mockReset();
  mocks.refresh.mockReset();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("PersonCreateForm", () => {
  it("renders required labels, Romanian phone default, numeric dates, and Romanian country default", () => {
    renderCreateForm();

    expect(
      screen.getByRole("heading", { name: "New person" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Contact")).toBeInTheDocument();
    expect(screen.getByText("Address")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(requiredLabel("First name")).toHaveTextContent(/First name\s*\*/);
    expect(requiredLabel("Last name")).toHaveTextContent(/Last name\s*\*/);
    expect(requiredLabel("Email")).toHaveTextContent(/Email\s*\*/);
    expect(requiredLabel("Phone")).toHaveTextContent(/Phone\s*\*/);
    expect(requiredLabel("Country")).toHaveTextContent(/Country\s*\*/);
    expect(screen.getByLabelText("Phone country")).toHaveValue("RO");
    expect(screen.getByLabelText("Country")).toHaveValue("RO");
    expect(screen.getByLabelText("County")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("DD")).toHaveAttribute(
      "inputmode",
      "numeric",
    );
    expect(screen.getByPlaceholderText("MM")).toHaveAttribute(
      "inputmode",
      "numeric",
    );
    expect(screen.getByPlaceholderText("YYYY")).toHaveAttribute(
      "inputmode",
      "numeric",
    );
  });

  it("renders Romanian create page copy and localized date placeholders", async () => {
    const browser = userEvent.setup();

    renderCreateForm("ro");

    expect(
      screen.getByRole("heading", { name: "Persoană nouă" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Contact")).toBeInTheDocument();
    expect(screen.getByText("Adresă")).toBeInTheDocument();
    expect(screen.getByText("Documente")).toBeInTheDocument();
    expect(screen.getByLabelText("Prenume")).toBeInTheDocument();
    expect(screen.getByLabelText("Telefon")).toBeInTheDocument();
    expect(screen.getByLabelText("Țară")).toHaveValue("RO");
    expect(screen.getByLabelText("Județ")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("ZZ")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("LL")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("AAAA")).toBeInTheDocument();

    await browser.click(
      screen.getByRole("button", { name: "Adaugă document" }),
    );
    await browser.click(
      await screen.findByRole("menuitem", { name: "Carte de identitate" }),
    );

    expect(
      screen.getByRole("heading", { name: "Carte de identitate" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Carte de identitate")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tip document")).not.toBeInTheDocument();
    expect(screen.queryByText("nationalId")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Serie")).toBeInTheDocument();
    expect(screen.getByLabelText("Număr")).toBeInTheDocument();
    expect(screen.getByLabelText("CNP")).toBeInTheDocument();
    expect(screen.getByLabelText("Emis de")).toBeInTheDocument();
    expect(screen.getByLabelText("Emis la")).toBeInTheDocument();
    expect(screen.getByLabelText("Stare document")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Creează persoana" }),
    ).toBeInTheDocument();
  });

  it("adds one identity document and one driver license slot", async () => {
    const browser = userEvent.setup();

    renderCreateForm();

    await browser.click(screen.getByRole("button", { name: "Add document" }));

    expect(
      await screen.findByRole("menuitem", { name: "National ID" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Driver license" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Passport" }),
    ).toBeInTheDocument();

    await browser.click(screen.getByRole("menuitem", { name: "National ID" }));

    expect(
      screen.getByRole("heading", { name: "National ID" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Document type")).not.toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Add document" }));

    expect(
      screen.queryByRole("menuitem", { name: "National ID" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Passport" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "Driver license" }),
    ).toBeInTheDocument();

    await browser.click(
      screen.getByRole("menuitem", { name: "Driver license" }),
    );
    expect(
      screen.getByRole("heading", { name: "Driver license" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Identity document and driver license have been added."),
    ).toBeInTheDocument();

    await browser.click(
      screen.getAllByRole("button", { name: "Remove document" })[0]!,
    );
    await browser.click(screen.getByRole("button", { name: "Add document" }));

    expect(
      await screen.findByRole("menuitem", { name: "National ID" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Passport" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Driver license" }),
    ).not.toBeInTheDocument();
  });

  it("keeps year digits as typed without leading zero padding", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await browser.type(screen.getByLabelText("Date of birth YYYY"), "2");

    expect(screen.getByLabelText("Date of birth YYYY")).toHaveValue("2");
  });

  it("shows required field validation inline through zod", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    const firstNameInput = screen.getByLabelText("First name");

    const alertTitle = await screen.findByText("Person not created");
    const alert = alertTitle.closest('[role="alert"]');

    expect(alertTitle).toBeInTheDocument();
    expect(alert).toHaveTextContent("Email is required.");
    expect(alert).toHaveTextContent("Phone is required.");
    expect(alert).toHaveTextContent("First name is required.");
    expect(alert).toHaveTextContent("Last name is required.");
    expect(alert?.nextElementSibling).toContainElement(
      screen.getByRole("button", { name: "Create person" }),
    );
    expect(firstNameInput).toHaveAttribute("aria-invalid", "true");
    expect(firstNameInput).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("first-name-error"),
    );
    expect(
      document.getElementById(`${firstNameInput.id}-error`),
    ).toHaveTextContent("First name is required.");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("normalizes a Romanian local phone and submits the full create payload", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdPerson);
    const browser = userEvent.setup();

    renderCreateForm();
    await fillFullCreateForm(browser, { phone: "0749096855" });
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.persons.ROUTES.create,
        v1.persons.personSchema,
        {
          method: "POST",
          json: {
            email: "rider@example.com",
            phone: "+40749096855",
            firstName: "Grace",
            lastName: "Hopper",
            dateOfBirth: "1990-02-28",
            addressLine1: "1 Rental Street",
            addressLine2: "Apt 4",
            city: "Bucharest",
            region: "București",
            postalCode: "010101",
            countryCode: "RO",
            documents: [
              {
                type: "nationalId",
                series: "RX",
                number: "123456",
                cnp: "1900228123450",
                issuingCountryCode: "RO",
                issuedBy: "SPCLEP Bucuresti",
                issuedOn: "2024-01-15",
                expiresOn: "2030-01-31",
                status: "unverified",
              },
            ],
            notes: "Frequent rider",
          },
        },
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/persons");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("rejects an invalid non-normalizable phone", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredFields(browser, { phone: "123" });
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    const phoneInput = screen.getByLabelText("Phone");
    const phoneError =
      "Enter a phone number in international format, e.g. +40712345678.";

    expect(await screen.findByText("Person not created")).toBeInTheDocument();
    expect(await screen.findAllByText(phoneError)).toHaveLength(2);
    expect(phoneInput).toHaveAttribute("aria-invalid", "true");
    expect(phoneInput).toHaveAccessibleDescription(phoneError);
    expect(mocks.apiFetch).not.toHaveBeenCalled();

    await browser.clear(phoneInput);
    await browser.type(phoneInput, "749096855");

    expect(phoneInput).not.toHaveAttribute("aria-invalid");
  });

  it("shows localized feedback for incomplete and invalid date parts", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredFields(browser);
    await browser.type(screen.getByLabelText("Date of birth"), "28");
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    const dateOfBirthDayInput = screen.getByLabelText("Date of birth");

    expect(await screen.findAllByText("Complete Date of birth.")).toHaveLength(
      2,
    );
    expect(dateOfBirthDayInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Date of birth MM")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(dateOfBirthDayInput).toHaveAccessibleDescription(
      "Complete Date of birth.",
    );
    expect(mocks.apiFetch).not.toHaveBeenCalled();

    await browser.type(screen.getByLabelText("Date of birth MM"), "02");
    await browser.type(screen.getByLabelText("Date of birth YYYY"), "1990");
    await browser.clear(screen.getByLabelText("Date of birth"));
    await browser.type(screen.getByLabelText("Date of birth"), "31");
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    expect(
      await screen.findAllByText("Enter a valid Date of birth."),
    ).toHaveLength(2);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("shows nested document validation inline", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredFields(browser);
    await addDocument(browser, "National ID");
    await browser.type(screen.getByLabelText("CNP"), "123");
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    const cnpInput = screen.getByLabelText("CNP");
    const cnpError = "Enter a valid CNP.";

    expect(await screen.findAllByText(cnpError)).toHaveLength(2);
    expect(cnpInput).toHaveAttribute("aria-invalid", "true");
    expect(cnpInput).toHaveAccessibleDescription(cnpError);
    expect(mocks.apiFetch).not.toHaveBeenCalled();

    await browser.clear(cnpInput);
    await browser.type(cnpInput, "1900228123450");

    expect(cnpInput).not.toHaveAttribute("aria-invalid");
  });

  it("shows Romanian validation copy inline", async () => {
    const browser = userEvent.setup();

    renderCreateForm("ro");
    await browser.type(screen.getByLabelText("Prenume"), "Ana");
    await browser.type(screen.getByLabelText("Nume"), "Ionescu");
    await browser.type(screen.getByLabelText("Email"), "ana@example.com");
    await browser.type(screen.getByLabelText("Telefon"), "123");
    await browser.click(
      screen.getByRole("button", { name: "Creează persoana" }),
    );

    const phoneInput = screen.getByLabelText("Telefon");
    const phoneError =
      "Introdu un număr de telefon în format internațional, de exemplu +40712345678.";

    expect(
      await screen.findByText("Persoana nu a fost creată"),
    ).toBeInTheDocument();
    expect(await screen.findAllByText(phoneError)).toHaveLength(2);
    expect(phoneInput).toHaveAccessibleDescription(phoneError);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("switches non-Romanian addresses to free-text region", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    expect(screen.getByLabelText("County")).toBeInTheDocument();

    await browser.selectOptions(screen.getByLabelText("Country"), "US");

    expect(screen.queryByLabelText("County")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Region")).toBeInTheDocument();
    expect(screen.getByLabelText("Region")).toHaveValue("");
  });

  it("shows API errors when create fails", async () => {
    mocks.apiFetch.mockRejectedValueOnce(
      new ApiError(409, "Phone already exists"),
    );
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredFields(browser);
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    expect(await screen.findByText("Phone already exists")).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

function renderCreateForm(locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <PersonCreateForm
        personsHref={locale === "en" ? "/en/persons" : "/persons"}
      />
    </NextIntlClientProvider>,
  );
}

async function fillRequiredFields(
  browser: ReturnType<typeof userEvent.setup>,
  overrides: Partial<Pick<v1.persons.CreatePersonInput, "phone">> = {},
) {
  await browser.type(screen.getByLabelText("First name"), "Grace");
  await browser.type(screen.getByLabelText("Last name"), "Hopper");
  await browser.type(screen.getByLabelText("Email"), "rider@example.com");
  await browser.type(
    screen.getByLabelText("Phone"),
    overrides.phone ?? "749096855",
  );
}

async function fillFullCreateForm(
  browser: ReturnType<typeof userEvent.setup>,
  overrides: Partial<Pick<v1.persons.CreatePersonInput, "phone">> = {},
) {
  await fillRequiredFields(browser, overrides);
  await fillDateParts(browser, "Date of birth", {
    day: "28",
    month: "02",
    year: "1990",
  });
  await browser.selectOptions(screen.getByLabelText("County"), "București");
  await browser.type(
    screen.getByLabelText("Address line 1"),
    "1 Rental Street",
  );
  await browser.type(screen.getByLabelText("Address line 2"), "Apt 4");
  await browser.type(screen.getByLabelText("City"), "Bucharest");
  await browser.type(screen.getByLabelText("Postal code"), "010101");
  await addDocument(browser, "National ID");
  await browser.type(screen.getByLabelText("Series"), "rx");
  await browser.type(screen.getByLabelText("Number"), "123456");
  await browser.type(screen.getByLabelText("CNP"), "1900228123450");
  await browser.type(screen.getByLabelText("Issued by"), "SPCLEP Bucuresti");
  await fillDateParts(browser, "Issued on", {
    day: "15",
    month: "01",
    year: "2024",
  });
  await fillDateParts(browser, "Expires on", {
    day: "31",
    month: "01",
    year: "2030",
  });
  await browser.type(screen.getAllByLabelText("Notes")[1]!, "Frequent rider");
}

async function addDocument(
  browser: ReturnType<typeof userEvent.setup>,
  typeLabel: string,
) {
  await browser.click(screen.getByRole("button", { name: "Add document" }));
  await browser.click(await screen.findByRole("menuitem", { name: typeLabel }));
}

async function fillDateParts(
  browser: ReturnType<typeof userEvent.setup>,
  label: string,
  value: { day: string; month: string; year: string },
) {
  await browser.type(screen.getByLabelText(label), value.day);
  await browser.type(screen.getByLabelText(`${label} MM`), value.month);
  await browser.type(screen.getByLabelText(`${label} YYYY`), value.year);
}

function requiredLabel(controlName: string): HTMLElement {
  const control = screen.getByLabelText(controlName);
  const id = control.getAttribute("id");
  const label = id
    ? document.querySelector<HTMLLabelElement>(`label[for="${id}"]`)
    : null;

  expect(label).not.toBeNull();
  expect(label?.parentElement).not.toBeNull();
  return label!.parentElement!;
}
