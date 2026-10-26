import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { act, render, screen, waitFor } from "@testing-library/react";
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

const scooter: v1.scooters.ScooterListItem = {
  id: "scooter-1",
  vin: "JYARN23E0RA123456",
  brandId: "brand-yamaha",
  brand: "Yamaha",
  fleetNumber: 1,
  brandCode: "YAM",
  model: "NMAX",
  color: "White",
  manufactureYear: 2026,
  powertrainType: "combustion",
  engineCode: null,
  engineDisplacementCc: 125,
  powerKw: 8.5,
  registrationType: "unregistered",
  registrationNumber: null,
  registrationDate: null,
  temporaryRegistrationExpiresAt: null,
  requiredLicenseCategory: "none",
  currentMileageKm: null,
  hasGps: null,
  odometerWorking: null,
  speedometerWorking: null,
  actualMaxSpeedKmh: null,
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
  it.each([
    { unmounted: false, returnToList: false },
    { unmounted: true, returnToList: false },
    { unmounted: true, returnToList: true },
  ])(
    "ignores a delayed search after leaving the list ($unmounted, $returnToList)",
    async ({ unmounted, returnToList }) => {
      let resolveRequest!: (list: v1.scooters.ScooterList) => void;
      mocks.apiFetch.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
      );
      const browser = userEvent.setup();
      const view = renderScooters();
      await browser.type(screen.getByLabelText("Search scooters"), "honda");
      await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());

      window.history.pushState(
        { route: "details" },
        "",
        "/en/scooters/scooter-1",
      );
      if (unmounted) view.unmount();
      if (returnToList) {
        window.history.pushState({ route: "list" }, "", "/en/scooters");
      }
      const replaceState = vi.spyOn(window.history, "replaceState").mockClear();
      await act(async () => resolveRequest(scooterList([], { total: 0 })));

      expect(replaceState).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe(
        returnToList ? "/en/scooters" : "/en/scooters/scooter-1",
      );
      expect(window.location.search).toBe("");
      expect(window.history.state).toEqual({
        route: returnToList ? "list" : "details",
      });
      replaceState.mockRestore();
      if (!unmounted) expect(screen.getByText("Yamaha NMAX")).toBeVisible();
    },
  );

  it("does not repeatedly fetch a whitespace-normalized search", async () => {
    mocks.apiFetch.mockResolvedValue(scooterList([], { total: 0 }));
    const browser = userEvent.setup();
    renderScooters();
    await browser.type(screen.getByLabelText("Search scooters"), "yamaha   ");
    expect(
      await screen.findByText(messages.en.shared.list.noResults),
    ).toBeVisible();
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 650)));
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?search=yamaha");
  });

  it("restores applied filters and results on browser Back and Forward", async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(scooterList([], { total: 0 }))
      .mockResolvedValueOnce(scooterList([scooter]))
      .mockResolvedValueOnce(scooterList([], { total: 0 }));
    const browser = userEvent.setup();
    renderScooters();
    await browser.click(screen.getByRole("button", { name: "Filters" }));
    await browser.click(
      screen.getByRole("button", { name: "Propulsion system" }),
    );
    await browser.click(screen.getByRole("button", { name: "Electric" }));
    await browser.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(window.location.search).toBe("?powertrainType=electric"),
    );

    act(() => {
      window.history.back();
    });
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenLastCalledWith(
        `${v1.scooters.ROUTES.list}?page=1&pageSize=25`,
        v1.scooters.scooterListSchema,
        { cache: "no-store" },
      ),
    );
    expect(await screen.findByText("Yamaha NMAX")).toBeVisible();
    expect(window.location.search).toBe("");
    await browser.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.getByRole("button", { name: "Propulsion system" }),
    ).toHaveTextContent("All");

    act(() => {
      window.history.forward();
    });
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(3));
    expect(
      await screen.findByText(messages.en.shared.list.noResults),
    ).toBeVisible();
    expect(window.location.search).toBe("?powertrainType=electric");
    expect(
      screen.queryByRole("dialog", { name: "Filters" }),
    ).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.getByRole("button", { name: "Propulsion system" }),
    ).toHaveTextContent("Electric");
  });

  it("keeps failed filter drafts open and retries the same selection", async () => {
    mocks.apiFetch
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(scooterList([], { total: 0 }));
    const browser = userEvent.setup();
    renderScooters();
    await browser.click(screen.getByRole("button", { name: "Filters" }));
    await browser.click(
      screen.getByRole("button", { name: "Propulsion system" }),
    );
    await browser.click(screen.getByRole("button", { name: "Electric" }));
    await browser.click(screen.getByRole("button", { name: "Apply" }));
    expect(
      await screen.findByText(messages.en.shared.list.applyError),
    ).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Propulsion system" }),
    ).toHaveTextContent("Electric");
    expect(window.location.search).toBe("");
    await browser.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Filters" }),
      ).not.toBeInTheDocument(),
    );
    expect(window.location.search).toBe("?powertrainType=electric");
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
  });

  it("discards a nested filter selection when the parent sheet is cancelled", async () => {
    const browser = userEvent.setup();
    renderScooters();
    await browser.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(sheet).toHaveClass("bg-popover");
    expect(sheet).not.toHaveClass("bg-background");
    for (const surface of sheet.querySelectorAll(
      "[data-slot=bottom-sheet-header], [data-slot=bottom-sheet-body], [data-slot=bottom-sheet-footer]",
    )) {
      expect(surface).not.toHaveClass("bg-background");
    }
    await browser.click(
      screen.getByRole("button", { name: "Propulsion system" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Propulsion system" }),
    ).toBeVisible();
    await browser.click(
      await screen.findByRole("button", { name: "Electric" }),
    );
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Propulsion system" }),
    ).toHaveTextContent("Electric");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    await browser.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Filters" }),
      ).not.toBeInTheDocument(),
    );
    await browser.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.getByRole("button", { name: "Propulsion system" }),
    ).toHaveTextContent("All");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("renders the initial scooter list", () => {
    renderScooters();

    expect(screen.getByRole("link", { name: "Add scooter" })).toHaveAttribute(
      "href",
      "/en/scooters/new",
    );
    expect(screen.getByText("Yamaha NMAX")).toBeInTheDocument();
    expect(screen.getByText("001 YAM")).toBeInTheDocument();
    expect(screen.queryByText("JYARN23E0RA123456")).not.toBeInTheDocument();
    expect(screen.getByText("White")).toBeInTheDocument();
    expect(screen.getByText("125 cc")).toBeInTheDocument();
    expect(screen.getByText("Unregistered")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View 001 YAM" })).toHaveAttribute(
      "href",
      "/en/scooters/scooter-1",
    );
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
    expect(screen.getByText("001 YAM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vezi 001 YAM" })).toHaveAttribute(
      "href",
      "/scooters/scooter-1",
    );
    expect(screen.getByRole("button", { name: "Filtre" })).toBeInTheDocument();
  });

  it("prioritizes the plate and rental details, with mileage as secondary information", () => {
    renderScooters(
      scooterList([
        scooterRecord({
          registrationType: "local",
          registrationNumber: "VL-BUJORENI-175",
          requiredLicenseCategory: "AM",
          currentMileageKm: 12500,
        }),
      ]),
    );
    expect(screen.getByText("001 YAM").parentElement).toContainElement(
      screen.getByText("VL-BUJORENI-175"),
    );
    expect(screen.getByText("Licence: AM")).toBeInTheDocument();
    expect(screen.getByLabelText("Mileage: 12,500 km")).toBeInTheDocument();
    expect(screen.queryByText(scooter.vin)).not.toBeInTheDocument();
    expect(screen.queryByText("2026")).not.toBeInTheDocument();
    expect(screen.queryByText("Local")).not.toBeInTheDocument();
  });

  it("shows specific attention messages in Romanian", () => {
    renderScooters(
      scooterList([
        scooterRecord({
          insuranceAttention: "expired",
          hasCivDocument: true,
          registrationType: "national",
          registrationNumber: "B123ABC",
          rentalInsuranceStatus: "expired",
          itpStatus: "active",
          speedometerWorking: false,
          odometerWorking: false,
        }),
      ]),
      "ro",
    );
    expect(
      screen.getByText(
        "Vitezometrul nu funcționează · Odometrul nu funcționează",
      ),
    ).toBeInTheDocument();
  });

  it("shows the CIV prerequisite before insurance or ITP errors", () => {
    renderScooters(
      scooterList([
        scooterRecord({
          hasCivDocument: false,
          rentalInsuranceStatus: "expired",
          itpStatus: "expired",
        }),
      ]),
    );
    expect(screen.getByText("Needs CIV")).toHaveAttribute(
      "data-variant",
      "warning",
    );
    expect(screen.queryByText("Expired insurance")).not.toBeInTheDocument();
    expect(screen.queryByText("Expired ITP")).not.toBeInTheDocument();
  });

  it.each([
    ["missing", "Needs insurance"],
    ["expired", "Expired insurance"],
  ] as const)(
    "shows %s insurance separately from expired ITP",
    (rentalInsuranceStatus, label) => {
      renderScooters(
        scooterList([
          scooterRecord({
            hasCivDocument: true,
            registrationType: "national",
            registrationNumber: "B123ABC",
            rentalInsuranceStatus,
            itpStatus: "expired",
          }),
        ]),
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText("Expired ITP")).toBeInTheDocument();
    },
  );

  it("uses the short unregistered badge", () => {
    renderScooters(
      scooterList([
        scooterRecord({
          hasCivDocument: true,
          registrationType: "unregistered",
          registrationNumber: null,
        }),
      ]),
    );
    expect(
      screen
        .getAllByText("Unregistered")
        .some((element) => element.getAttribute("data-slot") === "badge"),
    ).toBe(true);
    expect(
      screen.queryByText("Needs Romanian registration"),
    ).not.toBeInTheDocument();
  });

  it("keeps unknown checks neutral and shows zero mileage", () => {
    renderScooters(
      scooterList([
        scooterRecord({
          insuranceAttention: null,
          speedometerWorking: null,
          odometerWorking: null,
          currentMileageKm: 0,
        }),
      ]),
    );
    expect(screen.getByLabelText("Mileage: 0 km")).toBeInTheDocument();
    expect(
      screen.queryByText(/not working|Insurance expired|Check insurance/),
    ).not.toBeInTheDocument();
  });

  it("shows electric propulsion without combustion capacity and flags future coverage", () => {
    renderScooters(
      scooterList([
        scooterRecord({
          powertrainType: "electric",
          engineDisplacementCc: null,
          insuranceAttention: "upcoming",
          hasCivDocument: true,
          registrationType: "national",
          registrationNumber: "B123ABC",
          rentalInsuranceStatus: "upcoming",
          itpStatus: "active",
        }),
      ]),
    );
    expect(screen.getByText("Electric")).toBeInTheDocument();
    expect(screen.queryByText(/cc$/)).not.toBeInTheDocument();
    expect(screen.getByText("Insurance not active yet")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Mileage:/)).not.toBeInTheDocument();
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
    expect(
      await screen.findByText(messages.en.shared.list.noResults),
    ).toBeInTheDocument();
    expect(window.location.search).toBe("?search=yamah");
  });

  it("keeps the search focused and editable while results load", async () => {
    mocks.apiFetch.mockReturnValueOnce(new Promise(() => {}));
    const browser = userEvent.setup();

    renderScooters();
    const search = screen.getByLabelText("Search scooters");
    await browser.type(search, "yamah");

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(search).toHaveFocus();
    expect(search).toBeEnabled();

    await browser.type(search, "a");
    expect(search).toHaveValue("yamaha");
  });

  it("resets accumulated results when search changes", async () => {
    const nextScooter = scooterRecord({
      id: "scooter-2",
      vin: "JYARN23E0RA654321",
      brand: "Honda",
      fleetNumber: 2,
      brandCode: "HON",
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
    expect(
      await screen.findByText(messages.en.shared.list.noResults),
    ).toBeInTheDocument();
    expect(screen.queryByText("Honda PCX")).not.toBeInTheDocument();
  });

  it("applies URL-backed sort through the backend list endpoint", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooterList([], { total: 0 }));
    const browser = userEvent.setup();

    renderScooters();
    await browser.click(screen.getByRole("button", { name: "Filters" }));
    await browser.click(screen.getByRole("button", { name: "Sort" }));
    await browser.click(
      await screen.findByRole("button", { name: "Brand Z-A" }),
    );
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeVisible();
    await browser.click(screen.getByRole("button", { name: "Apply" }));

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
    await browser.click(
      screen.getByRole("button", { name: "Propulsion system" }),
    );
    await browser.click(
      await screen.findByRole("button", { name: "Electric" }),
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
    await browser.click(screen.getByRole("button", { name: "Registration" }));
    await browser.click(
      await screen.findByRole("button", { name: "National" }),
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
      fleetNumber: 2,
      brandCode: "HON",
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
      fleetNumber: 2,
      brandCode: "HON",
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
      fleetNumber: 2,
      brandCode: "HON",
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
  items: v1.scooters.ScooterListItem[],
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
  overrides: Partial<v1.scooters.ScooterListItem> = {},
): v1.scooters.ScooterListItem {
  return {
    ...scooter,
    ...overrides,
  };
}

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({
    user: {
      effectiveScopes: {
        "persons.read": ["ALL"],
        "persons.create": ["ALL"],
        "persons.update": ["ALL"],
        "persons.archive": ["ALL"],
        "persons.audit.read": ["ALL"],
        "person_documents.read": ["ALL"],
        "person_documents.write": ["ALL"],
        "person_documents.delete": ["ALL"],
        "scooters.read": ["ALL"],
        "scooters.create": ["ALL"],
        "scooters.update": ["ALL"],
        "scooters.archive": ["ALL"],
      },
    },
  }),
}));
