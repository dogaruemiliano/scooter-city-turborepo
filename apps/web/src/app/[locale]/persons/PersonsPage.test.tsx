import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PersonsPage } from "./PersonsPage";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock("../../../lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
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
  region: null,
  postalCode: "010101",
  countryCode: "RO",
  documents: [
    {
      id: "document-1",
      personId: "person-1",
      type: "nationalId",
      series: null,
      number: "RR123456",
      cnp: null,
      issuingCountryCode: "RO",
      issuedBy: null,
      issuedOn: null,
      expiresOn: "2030-01-31",
      status: "verified",
      notes: null,
      createdAt: "2026-06-25T10:00:00.000Z",
      updatedAt: "2026-06-25T10:00:00.000Z",
      deletedAt: null,
    },
  ],
  notes: null,
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T10:00:00.000Z",
  deletedAt: null,
};

beforeEach(() => {
  mocks.apiFetch.mockReset();
  window.history.replaceState(null, "", "/en/persons");

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("PersonsPage", () => {
  it("renders the initial persons list", () => {
    renderPersons();

    expect(
      screen.queryByRole("heading", { name: "Persons" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add person" })).toHaveAttribute(
      "href",
      "/en/persons/new",
    );
    expect(screen.queryByText("Person records")).not.toBeInTheDocument();
    expect(screen.queryByText("Showing 1-1 of 1")).not.toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View Ada Lovelace" }),
    ).toHaveAttribute("href", "/en/persons/person-1");
    expect(
      screen.getByRole("link", { name: "Email Ada Lovelace" }),
    ).toHaveAttribute("href", "mailto:ada@example.com");
    expect(
      screen.getByRole("link", { name: "Call Ada Lovelace" }),
    ).toHaveAttribute("href", "tel:+40712345678");
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("+40712345678")).toBeInTheDocument();
    expect(screen.getByText("National ID")).toBeInTheDocument();
    expect(screen.getByText("exp. Jan 31, 2030")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByLabelText("Expires on")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders Romanian page copy", () => {
    renderPersons(personList([person]), "ro");

    expect(
      screen.queryByRole("heading", { name: "Persoane" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Înregistrări persoane")).not.toBeInTheDocument();
    expect(screen.queryByText("Se afișează 1-1 din 1")).not.toBeInTheDocument();
    expect(screen.getByText("Carte de identitate")).toBeInTheDocument();
    expect(screen.getByText("Verificat")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Vezi Ada Lovelace" }),
    ).toHaveAttribute("href", "/persons/person-1");
    expect(
      screen.getByRole("link", { name: "Trimite email către Ada Lovelace" }),
    ).toHaveAttribute("href", "mailto:ada@example.com");
    expect(
      screen.getByRole("link", { name: "Sună Ada Lovelace" }),
    ).toHaveAttribute("href", "tel:+40712345678");
    expect(screen.getByRole("button", { name: "Filtre" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Adaugă persoană" }),
    ).toHaveAttribute("href", "/persons/new");
  });

  it("collapses operational filters by default", async () => {
    const browser = userEvent.setup();

    renderPersons();

    const filters = screen.getByRole("button", { name: "Filters" });
    const sort = screen.getByRole("combobox", { name: "Sort" });
    expect(filters).toHaveAttribute("aria-expanded", "false");
    expect(sort.closest("div")?.parentElement).toContainElement(filters);

    await browser.click(filters);

    expect(filters).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Country")).toBeVisible();
  });

  it("debounces search through the backend list endpoint", async () => {
    mocks.apiFetch.mockResolvedValueOnce(personList([], { total: 0 }));
    const browser = userEvent.setup();

    renderPersons();
    await browser.type(screen.getByLabelText("Search persons"), "hopper");

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        `${v1.persons.ROUTES.list}?page=1&pageSize=25&search=hopper`,
        v1.persons.personListSchema,
        { cache: "no-store" },
      ),
    );
    expect(await screen.findByText("No persons found.")).toBeInTheDocument();
    expect(window.location.search).toBe("?search=hopper");
  });

  it("applies URL-backed sort through the backend list endpoint", async () => {
    mocks.apiFetch.mockResolvedValueOnce(personList([], { total: 0 }));
    const browser = userEvent.setup();

    renderPersons();
    await browser.click(screen.getByRole("combobox", { name: "Sort" }));
    await browser.click(
      await screen.findByRole("option", { name: "Name Z-A" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        `${v1.persons.ROUTES.list}?page=1&pageSize=25&sort=nameDesc`,
        v1.persons.personListSchema,
        { cache: "no-store" },
      ),
    );
    expect(window.location.search).toBe("?sort=nameDesc");
  });

  it("applies URL-backed operational filters through the backend list endpoint", async () => {
    mocks.apiFetch.mockResolvedValueOnce(personList([], { total: 0 }));
    const browser = userEvent.setup();

    renderPersons();
    await browser.click(screen.getByRole("button", { name: "Filters" }));
    await browser.type(screen.getByLabelText("Country"), "ro");
    await browser.type(screen.getByLabelText("Issuing country"), "us");
    await browser.type(screen.getByLabelText("Expires from"), "2030-01-01");
    await browser.type(screen.getByLabelText("Expires to"), "2030-12-31");
    await browser.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        `${v1.persons.ROUTES.list}?page=1&pageSize=25&documentExpiresFrom=2030-01-01&documentExpiresTo=2030-12-31&countryCode=RO&documentIssuingCountryCode=US`,
        v1.persons.personListSchema,
        { cache: "no-store" },
      ),
    );
    expect(window.location.search).toBe(
      "?documentExpiresFrom=2030-01-01&documentExpiresTo=2030-12-31&countryCode=RO&documentIssuingCountryCode=US",
    );
  });

  it("initializes toolbar controls from the URL query", () => {
    renderPersons(personList([person]), "en", {
      page: 1,
      pageSize: 25,
      search: "ada",
      countryCode: "RO",
      documentIssuingCountryCode: "US",
      sort: "emailDesc",
      includeDeleted: false,
    });

    expect(screen.getByLabelText("Search persons")).toHaveValue("ada");
    expect(screen.getByLabelText("Country")).toHaveValue("RO");
    expect(screen.getByLabelText("Issuing country")).toHaveValue("US");
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveTextContent(
      "Email Z-A",
    );
  });

  it("resets URL-backed filters", async () => {
    mocks.apiFetch.mockResolvedValueOnce(personList([person]));
    const browser = userEvent.setup();

    renderPersons(personList([person]), "en", {
      page: 1,
      pageSize: 25,
      search: "ada",
      countryCode: "RO",
      includeDeleted: false,
    });
    window.history.replaceState(
      null,
      "",
      "/en/persons?search=ada&countryCode=RO",
    );

    await browser.click(screen.getByRole("button", { name: "Reset" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        `${v1.persons.ROUTES.list}?page=1&pageSize=25`,
        v1.persons.personListSchema,
        { cache: "no-store" },
      ),
    );
    expect(window.location.search).toBe("");
  });

  it("requests the next backend page from pagination controls", async () => {
    mocks.apiFetch.mockResolvedValueOnce(
      personList([{ ...person, id: "person-2", email: "grace@example.com" }], {
        page: 2,
        pageSize: 1,
        total: 2,
      }),
    );
    const browser = userEvent.setup();

    renderPersons(personList([person], { page: 1, pageSize: 1, total: 2 }));
    await browser.click(screen.getByLabelText("Go to next page"));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        `${v1.persons.ROUTES.list}?page=2&pageSize=1`,
        v1.persons.personListSchema,
        { cache: "no-store" },
      ),
    );
  });
});

function renderPersons(
  initialList = personList([person]),
  locale: SupportedLocale = "en",
  initialQuery = v1.persons.listPersonsQuerySchema.parse({
    page: initialList.page,
    pageSize: initialList.pageSize,
  }),
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <PersonsPage
        createHref={locale === "en" ? "/en/persons/new" : "/persons/new"}
        initialList={initialList}
        initialQuery={initialQuery}
      />
    </NextIntlClientProvider>,
  );
}

function personList(
  items: v1.persons.Person[],
  overrides: Partial<Omit<v1.persons.PersonList, "items">> = {},
): v1.persons.PersonList {
  return {
    items,
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 25,
    total: overrides.total ?? items.length,
  };
}
