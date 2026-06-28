import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PersonRoutePage from "../[id]/page";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  cookies: vi.fn(),
  meFromApi: vi.fn(),
  notFound: vi.fn(),
  refresh: vi.fn(),
  redirect: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("@/lib/auth-server", () => ({
  meFromApi: mocks.meFromApi,
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
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
  region: null,
  postalCode: "010101",
  countryCode: "RO",
  documents: [
    {
      id: "document-1",
      personId: "person-1",
      type: "nationalId",
      series: "RR",
      number: "123456",
      cnp: "1900228123450",
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
    {
      id: "document-2",
      personId: "person-1",
      type: "driverLicense",
      series: "DL",
      number: "654321",
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
  mocks.cookies.mockReset();
  mocks.meFromApi.mockReset();
  mocks.notFound.mockReset();
  mocks.refresh.mockReset();
  mocks.redirect.mockReset();
  mocks.replace.mockReset();

  mocks.cookies.mockResolvedValue({ toString: () => "session=abc" });
  mocks.meFromApi.mockResolvedValue({
    id: "user-1",
    email: "admin@example.com",
    roles: ["ADMIN"],
  });
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  mocks.redirect.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
});

describe("PersonRoutePage", () => {
  it("redirects unauthenticated users to sign in with the detail return path", async () => {
    mocks.meFromApi.mockResolvedValueOnce(null);

    await expect(renderRoute()).rejects.toThrow(
      "NEXT_REDIRECT:/en/sign-in?next=%2Fen%2Fpersons%2Fperson-1",
    );

    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("renders not found for non-admin users", async () => {
    mocks.meFromApi.mockResolvedValueOnce({
      id: "user-2",
      email: "user@example.com",
      roles: ["USER"],
    });

    await expect(renderRoute()).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("maps API 404 responses to not found", async () => {
    mocks.apiFetch.mockRejectedValueOnce(new ApiError(404, "Person not found"));

    await expect(renderRoute()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders a fetched person detail page", async () => {
    mocks.apiFetch.mockResolvedValueOnce(person).mockResolvedValueOnce([]);

    const element = await renderRoute();

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.persons.ROUTES.get("person-1"),
      v1.persons.personSchema,
      {
        headers: { cookie: "session=abc" },
        cache: "no-store",
      },
    );
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.persons.ROUTES.auditEvents.list("person-1"),
      v1.persons.personAuditEventListSchema,
      {
        headers: { cookie: "session=abc" },
        cache: "no-store",
      },
    );

    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        {element}
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Ada Lovelace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("National ID")).toBeInTheDocument();
  });
});

function renderRoute() {
  return PersonRoutePage({
    params: Promise.resolve({ locale: "en", id: "person-1" }),
  });
}
