import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
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
});

function renderEditForm(locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <PersonEditForm person={person} personHref="/en/persons/person-1" />
    </NextIntlClientProvider>,
  );
}
