import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScootersPage } from "./ScootersPage";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

let intersectionObservers: MockIntersectionObserver[] = [];

class MockIntersectionObserver {
  private readonly callback: IntersectionObserverCallback;
  readonly options?: IntersectionObserverInit;

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.options = options;
    intersectionObservers.push(this);
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);

  trigger(isIntersecting = true) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

const scooter: v1.scooters.Scooter = {
  id: "scooter-1",
  vin: "JYARN23E0RA123456",
  brand: "Yamaha",
  model: "NMAX",
  color: "White",
  manufactureYear: 2026,
  powertrainType: "combustion",
  engineCc: 125,
  powerKw: 8.5,
  purchasedOn: "2026-01-15",
  registrationType: "unregistered",
  plateNumber: null,
  registeredOn: null,
  registrationExpiresOn: null,
  requiredDriverLicenseType: "none",
  notes: null,
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T10:00:00.000Z",
  deletedAt: null,
};

beforeEach(() => {
  mocks.apiFetch.mockReset();
  intersectionObservers = [];
  window.history.replaceState(null, "", "/en/scooters");

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    value: MockIntersectionObserver,
  });
});

describe("ScootersPage", () => {
  it("renders the initial scooter list", () => {
    renderScooters();

    expect(screen.getByRole("link", { name: "Add scooter" })).toHaveAttribute(
      "href",
      "/en/scooters/new",
    );
    expect(screen.getByText("Yamaha NMAX")).toBeInTheDocument();
    expect(screen.getByText("JYARN23E0RA123456")).toBeInTheDocument();
    expect(screen.getByText("White")).toBeInTheDocument();
    expect(screen.getByText("125 cc")).toBeInTheDocument();
    expect(screen.getByText("Unregistered")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View Yamaha NMAX" }),
    ).toHaveAttribute("href", "/en/scooters/scooter-1");
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Go to next page")).not.toBeInTheDocument();
  });

  it("renders Romanian list copy", () => {
    renderScooters(scooterList([scooter]), "ro");

    expect(screen.getByRole("link", { name: "Adaugă scuter" })).toHaveAttribute(
      "href",
      "/scooters/new",
    );
    expect(screen.getByText("Neînmatriculat")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Vezi Yamaha NMAX" }),
    ).toHaveAttribute("href", "/scooters/scooter-1");
    expect(screen.getByRole("button", { name: "Filtre" })).toBeInTheDocument();
  });

  it("debounces search through the backend list endpoint", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooterList([], { total: 0 }));
    const browser = userEvent.setup();

    renderScooters();
    await browser.type(screen.getByLabelText("Search scooters"), "yamah");

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        `${v1.scooters.ROUTES.list}?page=1&pageSize=25&search=yamah`,
        v1.scooters.scooterListSchema,
        { cache: "no-store" },
      ),
    );
    expect(await screen.findByText("No scooters found.")).toBeInTheDocument();
    expect(window.location.search).toBe("?search=yamah");
  });

  it("resets accumulated results when search changes", async () => {
    const nextScooter = scooterRecord({
      id: "scooter-2",
      vin: "JYARN23E0RA654321",
      brand: "Honda",
      model: "PCX",
    });
    mocks.apiFetch
      .mockResolvedValueOnce(scooterList([nextScooter], { page: 2, total: 26 }))
      .mockResolvedValueOnce(scooterList([], { total: 0 }));
    const browser = userEvent.setup();

    renderScooters(scooterList([scooter], { total: 26 }));
    await browser.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Honda PCX")).toBeInTheDocument();

    await browser.type(screen.getByLabelText("Search scooters"), "yamah");

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenLastCalledWith(
        `${v1.scooters.ROUTES.list}?page=1&pageSize=25&search=yamah`,
        v1.scooters.scooterListSchema,
        { cache: "no-store" },
      ),
    );
    expect(await screen.findByText("No scooters found.")).toBeInTheDocument();
    expect(screen.queryByText("Honda PCX")).not.toBeInTheDocument();
  });

  it("applies URL-backed sort through the backend list endpoint", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooterList([], { total: 0 }));
    const browser = userEvent.setup();

    renderScooters();
    await browser.click(screen.getByRole("combobox", { name: "Sort" }));
    await browser.click(
      await screen.findByRole("option", { name: "Brand Z-A" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        `${v1.scooters.ROUTES.list}?page=1&pageSize=25&sort=brandDesc`,
        v1.scooters.scooterListSchema,
        { cache: "no-store" },
      ),
    );
    expect(window.location.search).toBe("?sort=brandDesc");
  });

  it("applies URL-backed operational filters", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooterList([], { total: 0 }));
    const browser = userEvent.setup();

    renderScooters();
    await browser.click(screen.getByRole("button", { name: "Filters" }));
    await browser.click(screen.getByRole("combobox", { name: "Powertrain" }));
    await browser.click(
      await screen.findByRole("option", { name: "Electric" }),
    );
    await browser.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        `${v1.scooters.ROUTES.list}?page=1&pageSize=25&powertrainType=electric`,
        v1.scooters.scooterListSchema,
        { cache: "no-store" },
      ),
    );
    expect(window.location.search).toBe("?powertrainType=electric");
  });

  it("applies URL-backed registration type filters", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooterList([], { total: 0 }));
    const browser = userEvent.setup();

    renderScooters();
    await browser.click(screen.getByRole("button", { name: "Filters" }));
    await browser.click(screen.getByRole("combobox", { name: "Registration" }));
    await browser.click(
      await screen.findByRole("option", { name: "National" }),
    );
    await browser.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        `${v1.scooters.ROUTES.list}?page=1&pageSize=25&registrationType=national`,
        v1.scooters.scooterListSchema,
        { cache: "no-store" },
      ),
    );
    expect(window.location.search).toBe("?registrationType=national");
  });

  it("loads and appends the next page when the sentinel intersects", async () => {
    const nextScooter = scooterRecord({
      id: "scooter-2",
      vin: "JYARN23E0RA654321",
      brand: "Honda",
      model: "PCX",
    });
    mocks.apiFetch.mockResolvedValueOnce(
      scooterList([nextScooter], {
        page: 2,
        pageSize: 25,
        total: 26,
      }),
    );

    renderScooters(scooterList([scooter], { pageSize: 25, total: 26 }));
    await waitFor(() => expect(intersectionObservers).toHaveLength(1));
    expect(intersectionObservers[0]!.options).toEqual({
      rootMargin: "400px 0px",
    });
    intersectionObservers[0]!.trigger();

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        `${v1.scooters.ROUTES.list}?page=2&pageSize=25`,
        v1.scooters.scooterListSchema,
        { cache: "no-store" },
      ),
    );
    expect(await screen.findByText("Honda PCX")).toBeInTheDocument();
    expect(screen.getByText("Yamaha NMAX")).toBeInTheDocument();
  });

  it("loads and appends the next page from the fallback button", async () => {
    const nextScooter = scooterRecord({
      id: "scooter-2",
      vin: "JYARN23E0RA654321",
      brand: "Honda",
      model: "PCX",
    });
    mocks.apiFetch.mockResolvedValueOnce(
      scooterList([nextScooter], { page: 2, pageSize: 25, total: 26 }),
    );
    const browser = userEvent.setup();

    renderScooters(scooterList([scooter], { total: 26 }));
    await browser.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        `${v1.scooters.ROUTES.list}?page=2&pageSize=25`,
        v1.scooters.scooterListSchema,
        { cache: "no-store" },
      ),
    );
    expect(await screen.findByText("Honda PCX")).toBeInTheDocument();
  });

  it("does not expose infinite loading when all scooters are loaded", () => {
    renderScooters(scooterList([scooter], { total: 1 }));

    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
    expect(intersectionObservers).toHaveLength(0);
  });

  it("keeps existing scooters and retries after append failure", async () => {
    const nextScooter = scooterRecord({
      id: "scooter-2",
      vin: "JYARN23E0RA654321",
      brand: "Honda",
      model: "PCX",
    });
    mocks.apiFetch
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce(
        scooterList([nextScooter], { page: 2, pageSize: 25, total: 26 }),
      );
    const browser = userEvent.setup();

    renderScooters(scooterList([scooter], { total: 26 }));
    await browser.click(screen.getByRole("button", { name: "Load more" }));

    expect(
      await screen.findByText("Something went wrong. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Yamaha NMAX")).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Honda PCX")).toBeInTheDocument();
  });
});

function renderScooters(
  initialList = scooterList([scooter]),
  locale: SupportedLocale = "en",
  initialQuery: v1.scooters.ListScootersQuery = {
    page: 1,
    pageSize: initialList.pageSize,
    includeDeleted: false,
  },
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScootersPage
        createHref={locale === "en" ? "/en/scooters/new" : "/scooters/new"}
        initialList={initialList}
        initialQuery={initialQuery}
      />
    </NextIntlClientProvider>,
  );
}

function scooterList(
  items: v1.scooters.Scooter[],
  overrides: Partial<v1.scooters.ScooterList> = {},
): v1.scooters.ScooterList {
  return {
    items,
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 25,
    total: overrides.total ?? items.length,
  };
}

function scooterRecord(
  overrides: Partial<v1.scooters.Scooter> = {},
): v1.scooters.Scooter {
  return {
    ...scooter,
    ...overrides,
  };
}
