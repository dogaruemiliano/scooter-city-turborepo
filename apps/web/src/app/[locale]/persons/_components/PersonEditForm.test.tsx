import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PersonEditForm } from "./PersonEditForm";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
    url: (path: string) => `https://api.test${path}`,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    push: mocks.push,
  }),
}));

const person: v1.persons.Person = {
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
  documents: [],
  notes: "Frequent renter",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T11:00:00.000Z",
  deletedAt: null,
};

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  mocks.push.mockReset();
});

describe("PersonEditForm", () => {
  it("prefills contact fields including the split phone input", () => {
    renderEditForm();

    expect(screen.getByLabelText("First name")).toHaveValue("Ada");
    expect(screen.getByLabelText("Phone country")).toHaveValue("RO");
    expect(screen.getByLabelText("Phone")).toHaveValue("712345678");
    expect(screen.getByLabelText("Phone")).toHaveAttribute(
      "placeholder",
      "Phone number",
    );
  });

  it("updates the person and returns to the detail page", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ...person, firstName: "Grace" });
    const browser = userEvent.setup();

    renderEditForm();
    await browser.clear(screen.getByLabelText("First name"));
    await browser.type(screen.getByLabelText("First name"), "Grace");
    await browser.clear(screen.getByLabelText("Phone"));
    await browser.type(screen.getByLabelText("Phone"), "700111222");
    await browser.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.persons.ROUTES.update(person.id),
        v1.persons.personSchema,
        expect.objectContaining({
          method: "PATCH",
          json: expect.objectContaining({
            firstName: "Grace",
            phone: "+40700111222",
          }),
        }),
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/persons/person-1");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("validates a field when it loses focus, not before", async () => {
    const browser = userEvent.setup();
    renderEditForm();

    const firstName = screen.getByLabelText("First name");
    await browser.clear(firstName);

    // Still focused: the field has been emptied but not yet reported.
    expect(firstName).not.toHaveAttribute("aria-invalid");

    await browser.tab();

    await waitFor(() =>
      expect(firstName).toHaveAttribute("aria-invalid", "true"),
    );
    expect(firstName).toHaveAccessibleDescription("First name is required.");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("clears the error as the field is retyped, without waiting for blur", async () => {
    const browser = userEvent.setup();
    renderEditForm();

    const email = screen.getByLabelText("Email");
    await browser.clear(email);
    await browser.tab();

    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));

    await browser.type(email, "grace@example.com");

    await waitFor(() => expect(email).not.toHaveAttribute("aria-invalid"));
  });

  it("leaves untouched fields silent until submit", async () => {
    const browser = userEvent.setup();
    renderEditForm();

    // Editing one field must not flag the others.
    await browser.type(screen.getByLabelText("City"), "Cluj");
    await browser.tab();

    expect(screen.getByLabelText("First name")).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("summarizes how many fields need attention on submit", async () => {
    const browser = userEvent.setup();
    renderEditForm();

    await browser.clear(screen.getByLabelText("First name"));
    await browser.clear(screen.getByLabelText("Last name"));
    await browser.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("2 fields need attention."),
    ).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      locale: "en" as const,
      label: "Date of birth",
      message: "Date of birth cannot be in the future.",
    },
    {
      locale: "ro" as const,
      label: "Data nașterii",
      message: "Data nașterii nu poate fi în viitor.",
    },
  ])(
    "rejects a $locale date of birth in the future",
    async ({ label, locale, message }) => {
      const browser = userEvent.setup();
      renderEditForm(locale);

      const [day, month, year] = screen.getAllByLabelText(
        new RegExp(`^${label}`),
      );

      for (const [input, value] of [
        [day, "01"],
        [month, "01"],
        [year, "2999"],
      ] as const) {
        await browser.clear(input!);
        await browser.type(input!, value);
      }
      // Year -> calendar button is still inside the field, so a second tab is
      // needed to actually leave it.
      await browser.tab();
      await browser.tab();

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(mocks.apiFetch).not.toHaveBeenCalled();
    },
  );

  it("stops the date-of-birth calendar at today", async () => {
    const browser = userEvent.setup();
    const today = new Date();
    const todayIso = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    // Opens the calendar on the current month, so no wheel navigation is
    // needed to reach the boundary.
    renderEditForm("en", { ...person, dateOfBirth: todayIso });

    await browser.click(screen.getByRole("button", { name: "Open calendar" }));
    const dialog = await screen.findByRole("dialog");

    const todayLabel = new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
      year: "numeric",
    }).format(
      new Date(
        Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
      ),
    );

    expect(
      within(dialog).getByRole("button", { name: todayLabel }),
    ).toBeEnabled();
    // Everything past today is out of bounds, so the month cannot advance.
    expect(
      within(dialog).getByRole("button", { name: "Next month" }),
    ).toBeDisabled();
  });
});

function renderEditForm(
  locale: SupportedLocale = "en",
  editedPerson: v1.persons.Person = person,
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <PersonEditForm person={editedPerson} personHref="/en/persons/person-1" />
    </NextIntlClientProvider>,
  );
}
