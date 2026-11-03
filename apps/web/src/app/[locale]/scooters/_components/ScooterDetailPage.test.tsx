import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScooterDetailPage } from "./ScooterDetailPage";
import { PageRefreshSurface } from "@/components/PageRefresh";
import { ScooterNavigationProvider } from "./ScooterNavigation";
import {
  PageHeaderNavigationContext,
  type PageHeaderNavigationOptions,
} from "@/components/PageHeaderNavigation";
// Read-only gallery behavior is covered independently.
vi.mock("./ScooterDetailPhotos", () => ({ ScooterDetailPhotos: () => null }));
// Independent compliance forms are covered by their focused suites.
vi.mock("./ScooterComplianceSection", () => ({
  ScooterComplianceSection: () => null,
}));

const mocks = vi.hoisted(() => ({
  canReportProblem: true,
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  pathname: "/en/scooters/scooter-1",
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
    url: (path: string) => `http://localhost:3000${path}`,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
    push: mocks.push,
    back: mocks.back,
  }),
}));

const scooter: v1.scooters.Scooter = {
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
  currentMileageKm: 1_200,
  hasGps: null,
  odometerWorking: null,
  speedometerWorking: null,
  actualMaxSpeedKmh: null,
  notes: "Maker papers received",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T11:00:00.000Z",
  deletedAt: null,
};

beforeEach(() => {
  mocks.canReportProblem = true;
  mocks.pathname = "/en/scooters/scooter-1";
  mocks.push.mockReset();
  mocks.back.mockReset();
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  mocks.replace.mockReset();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("ScooterDetailPage", () => {
  it.each(["en", "ro"] as const)(
    "lists only the missing client document types in the warning (%s)",
    (locale) => {
      renderDetail(locale, {
        ...scooter,
        hasCivDocument: true,
        registrationType: "national",
        registrationNumber: "B123ABC",
        rentalInsuranceStatus: "active",
        itpStatus: "active",
        missingClientDocuments: ["insurance", "itp_card"],
      });
      const catalog = messages[locale].scooters;
      const alert = screen
        .getByText(catalog.readiness.needsClientDocuments)
        .closest<HTMLElement>('[role="alert"]')!;
      expect(within(alert).getByRole("list")).toBeVisible();
      expect(
        within(alert)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual([catalog.documents.insurance, catalog.documents.itp_card]);
      expect(
        within(alert).getByText(catalog.readiness.clientDocumentsHint),
      ).toBeVisible();
    },
  );

  it("omits the missing client documents warning when the server reports none", () => {
    renderDetail("en", {
      ...scooter,
      hasCivDocument: true,
      registrationType: "national",
      registrationNumber: "B123ABC",
      rentalInsuranceStatus: "active",
      itpStatus: "active",
      missingClientDocuments: [],
    });
    expect(
      screen.queryByText(messages.en.scooters.readiness.needsClientDocuments),
    ).not.toBeInTheDocument();
  });

  it("disables sharing with a small missing-documents description", async () => {
    const browser = userEvent.setup();
    renderDetail();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    const item = await screen.findByRole("menuitem", {
      name: /Share client documents/,
    });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAccessibleDescription("Missing documents");
    expect(within(item).getByText("Missing documents")).toHaveClass("text-xs");
  });

  it("shares every client copy from the header menu", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    const download = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response("client pdf")));
    vi.stubGlobal("fetch", download);
    try {
      const documents: v1.scooters.ScooterDocument[] = (
        ["civ", "registration_certificate", "insurance"] as const
      ).map((type) => ({
        id: type,
        type,
        fileName: `${type}.pdf`,
        contentType: "application/pdf",
        byteSize: 8,
        createdAt: "2026-01-01T00:00:00Z",
        contentUrl: `/original/${type}`,
        validFrom: "2000-01-01",
        validUntil: "2099-01-01",
        clientCopy: {
          fileName: `${type}-client.pdf`,
          contentType: "application/pdf",
          byteSize: 8,
          contentUrl: `/client/${type}`,
        },
      }));
      const browser = userEvent.setup();
      renderDetail("en", { ...scooter, documents, missingClientDocuments: [] });
      await browser.click(screen.getByRole("button", { name: "More actions" }));
      await waitFor(() =>
        expect(
          screen.getByRole("menuitem", { name: "Share client documents" }),
        ).not.toHaveAttribute("aria-disabled", "true"),
      );
      await browser.click(
        screen.getByRole("menuitem", { name: "Share client documents" }),
      );
      expect(share).toHaveBeenCalledWith({
        title: "001 YAM",
        files: [expect.any(File), expect.any(File), expect.any(File)],
      });
    } finally {
      vi.unstubAllGlobals();
      delete (navigator as Partial<Navigator>).share;
      delete (navigator as Partial<Navigator>).canShare;
    }
  });

  it("shows the current cover when scooter data changes", () => {
    const view = renderDetail("en");
    expect(mocks.refresh).not.toHaveBeenCalled();

    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterDetailPage
          scooter={{ ...scooter, coverUrl: "/new-cover.png" }}
          scootersHref="/en/scooters"
        />
      </NextIntlClientProvider>,
    );
    const hero = within(screen.getByRole("region", { name: "001 YAM" }));
    expect(
      hero.getByRole("img", {
        name: messages.en.scooters.card.photoAlt.replace("{code}", "001 YAM"),
      }),
    ).toHaveAttribute("src", "http://localhost:3000/new-cover.png");
    expect(
      hero.queryByRole("img", { name: messages.en.scooters.card.noPhoto }),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      hasCivDocument: false,
      registrationType: "unregistered" as const,
      registrationNumber: null,
      temporaryRegistrationExpiresAt: null,
    },
    {
      hasCivDocument: true,
      registrationType: "unregistered" as const,
      registrationNumber: null,
      temporaryRegistrationExpiresAt: null,
    },
    {
      hasCivDocument: true,
      registrationType: "national" as const,
      registrationNumber: null,
      temporaryRegistrationExpiresAt: null,
    },
    {
      hasCivDocument: true,
      registrationType: "temporary" as const,
      registrationNumber: "B123456",
      temporaryRegistrationExpiresAt: "2020-01-01",
    },
    {
      hasCivDocument: true,
      registrationType: "national" as const,
      registrationNumber: "B123ABC",
      temporaryRegistrationExpiresAt: null,
    },
  ])(
    "uses shared readiness rules for hero registration badges: %j",
    (overrides) => {
      const record = { ...scooter, ...overrides };
      renderDetail("en", record);
      const hero = within(screen.getByRole("region", { name: "001 YAM" }));
      const issues = v1.scooters.scooterReadinessIssues(record);
      expect(hero.queryByText("No RAR") !== null).toBe(
        issues.includes("needsCiv"),
      );
      const registrationLabel =
        record.registrationType === "unregistered"
          ? messages.en.scooters.detail.hero.unregistered
          : messages.en.scooters.readiness.needsRegistration;
      expect(
        hero.queryByText(registrationLabel, {
          selector: '[data-slot="badge"]',
        }) !== null,
      ).toBe(issues.includes("needsRegistration"));
    },
  );

  it.each(["en", "ro"] as const)(
    "uses the bundled faded placeholder without a scooter image (%s)",
    (locale) => {
      renderDetail(locale);
      const fallback = screen.getByRole("img", {
        name: messages[locale].scooters.card.noPhoto,
      });
      expect(fallback.querySelector("img")).toHaveAttribute(
        "src",
        expect.stringContaining("%2Fscooter-placeholder.png"),
      );
      expect(fallback.querySelector("img")).toHaveStyle({ opacity: 0.5 });
      expect(
        within(fallback).getByText(
          messages[locale].scooters.detail.hero.noImageUploaded,
        ),
      ).toBeVisible();
    },
  );

  it.each([
    {
      value: true,
      gps: "GPS installed",
      speed: "Speedometer working",
      gpsColor: "text-success",
      speedColor: "text-foreground",
    },
    {
      value: false,
      gps: "No GPS installed",
      speed: "Speedometer absent or not working",
      gpsColor: "text-destructive",
      speedColor: "text-destructive",
    },
    {
      value: null,
      gps: "GPS status not specified",
      speed: "Speedometer status not specified",
      gpsColor: "text-warning",
      speedColor: "text-warning",
    },
  ])(
    "shows operational hero status for $value",
    ({ value, gps, speed, gpsColor, speedColor }) => {
      renderDetail("en", {
        ...scooter,
        hasGps: value,
        hasPhoneStand: value,
        hasChargingOutlet: value,
        speedometerWorking: value,
        actualMaxSpeedKmh: 45,
        odometerWorking: value,
      });
      const hero = within(screen.getByRole("region", { name: "001 YAM" }));
      expect(hero.getByRole("button", { name: gps })).toHaveClass(
        `${gpsColor.replace("text-", "bg-")}-subtle`,
        gpsColor,
        "size-9",
        "min-h-9",
        "min-w-9",
        "md:size-11",
        "md:min-h-11",
        "md:min-w-11",
      );
      for (const label of [/phone stand/i, /charging outlet/i]) {
        expect(hero.getByRole("button", { name: label })).toHaveClass(
          `${gpsColor.replace("text-", "bg-")}-subtle`,
          gpsColor,
          `${gpsColor.replace("text-", "border-")}/20`,
        );
      }
      expect(hero.getByRole("button", { name: gps })).toHaveClass(
        `${gpsColor.replace("text-", "border-")}/20`,
      );
      expect(
        hero.getByRole("button", { name: gps }).querySelector("span"),
      ).toHaveStyle({ maskImage: "url(/icons/satellite.svg)" });
      expect(
        hero
          .getByRole("button", { name: /phone stand/i })
          .querySelector("span"),
      ).toHaveStyle({ maskImage: "url(/icons/phone-stand.svg)" });
      expect(
        hero
          .getByRole("button", { name: /charging outlet/i })
          .querySelector("span"),
      ).toHaveStyle({ maskImage: "url(/icons/power.svg)" });
      const gauge = hero.getByRole("button", {
        name: `${speed}. Actual maximum speed: 45 km/h`,
      });
      expect(gauge).toHaveClass(speedColor);
      expect(within(gauge).getByText("45")).toBeVisible();
      expect(
        hero.queryByRole("button", { name: /Odometer not working/ }) !== null,
      ).toBe(value === false);
    },
  );

  it("shows unknown speed without inventing zero and explains the odometer warning on tap", async () => {
    renderDetail("en", {
      ...scooter,
      actualMaxSpeedKmh: null,
      odometerWorking: false,
    });
    const gauge = screen.getByRole("button", {
      name: /Actual maximum speed: — km\/h/,
    });
    expect(within(gauge).getByText("—")).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Odometer not working/ }));
    expect(
      await screen.findByRole("dialog", { name: /Odometer not working/ }),
    ).toHaveTextContent("Displayed mileage may be unreliable");
  });

  it("collapses operational, technical, registration and record details until requested", async () => {
    const browser = userEvent.setup();
    renderDetail();
    const toggle = screen.getByRole("button", { name: "More details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("heading", { name: "Operational information" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(scooter.id)).not.toBeInTheDocument();
    await browser.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("heading", { name: "Operational information" }),
    ).toBeVisible();
    expect(screen.getByText(scooter.id)).toBeVisible();
    await browser.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it.each(
    (["en", "ro"] as const).flatMap((locale) => [
      {
        locale,
        routes: ["/scooters", "/scooters/scooter-1"],
        historyBack: true,
      },
      {
        locale,
        routes: ["/scooters/new", "/scooters/scooter-1"],
        historyBack: false,
      },
      {
        locale,
        routes: ["/scooters/scooter-1/edit", "/scooters/scooter-1"],
        historyBack: false,
      },
      {
        locale,
        routes: [
          "/scooters",
          "/scooters/scooter-1",
          "/scooters/scooter-1/edit",
          "/scooters/scooter-1",
        ],
        historyBack: false,
      },
      { locale, routes: ["/scooters/scooter-1"], historyBack: false },
    ]),
  )(
    "chooses header Back for $routes ($locale, history: $historyBack)",
    ({ locale, routes, historyBack }) => {
      const register = vi.fn<
        (options: PageHeaderNavigationOptions) => () => void
      >(() => vi.fn());
      const href = locale === "en" ? "/en/scooters" : "/scooters";
      function navigation() {
        return (
          <NextIntlClientProvider locale={locale} messages={messages[locale]}>
            <PageHeaderNavigationContext.Provider value={register}>
              <ScooterNavigationProvider>
                {mocks.pathname.endsWith("/scooter-1") ? (
                  <ScooterDetailPage scooter={scooter} scootersHref={href} />
                ) : null}
              </ScooterNavigationProvider>
            </PageHeaderNavigationContext.Provider>
          </NextIntlClientProvider>
        );
      }
      mocks.pathname = `/${locale}${routes[0]}`;
      const view = render(navigation());
      for (const route of routes.slice(1)) {
        mocks.pathname = `/${locale}${route}`;
        view.rerender(navigation());
      }
      expect(register).toHaveBeenCalled();
      register.mock.calls.at(-1)?.[0].onBack?.();
      if (historyBack) {
        expect(mocks.back).toHaveBeenCalledOnce();
        expect(mocks.push).not.toHaveBeenCalled();
      } else {
        expect(mocks.push).toHaveBeenCalledWith(href);
        expect(mocks.back).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    ["en", "Report problem", "/en/problems/new"],
    ["ro", "Raportează o problemă", "/problems/new"],
  ] as const)(
    "opens the localized problem form with this scooter selected (%s)",
    async (locale, label, path) => {
      const browser = userEvent.setup();
      renderDetail(locale, { ...scooter, id: "scooter/one" });
      await browser.click(
        screen.getByRole("button", {
          name: messages[locale].scooters.actions.moreActions,
        }),
      );
      await browser.click(await screen.findByRole("menuitem", { name: label }));
      expect(mocks.push).toHaveBeenCalledWith(
        `${path}?scooterId=scooter%2Fone`,
      );
    },
  );

  it("hides report problem without creation permission", async () => {
    mocks.canReportProblem = false;
    const browser = userEvent.setup();
    renderDetail();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      screen.queryByRole("menuitem", { name: "Report problem" }),
    ).not.toBeInTheDocument();
  });

  it("groups the hero identity, VIN, mileage, license and concurrent recorded states", () => {
    renderDetail("ro", {
      ...scooter,
      maintenanceHoldCount: 2,
      hasCivDocument: false,
      requiredLicenseCategory: "A1",
    });
    const hero = within(screen.getByRole("region", { name: "001 YAM" }));
    expect(hero.getByText("Nefuncțional")).toBeInTheDocument();
    expect(
      hero.queryByText("Neînmatriculat", { selector: '[data-slot="badge"]' }),
    ).not.toBeInTheDocument();
    expect(hero.getByText("Fără RAR")).toBeInTheDocument();
    expect(
      hero.getByRole("img", { name: /Kilometraj:.*km/ }),
    ).toHaveAccessibleName("Kilometraj: 1.200 km");
    expect(hero.queryByText("125 cc")).not.toBeInTheDocument();
    expect(hero.getByText("Cat. A1")).toBeInTheDocument();
    expect(hero.getByText("Yamaha NMAX")).toBeInTheDocument();
    expect(hero.getByText(scooter.vin)).toBeInTheDocument();
    expect(hero.queryByText("Închiriat")).not.toBeInTheDocument();
  });

  it("keeps missing mileage distinct from zero and uses alert readiness rules for missing CIV data", () => {
    renderDetail("en", { ...scooter, currentMileageKm: null });
    const hero = within(screen.getByRole("region", { name: "001 YAM" }));
    expect(
      hero.getByRole("img", { name: "Total kilometers: Not provided" }),
    ).toHaveTextContent("—");
    expect(hero.getByText("No RAR")).toBeInTheDocument();
    expect(hero.getByText("No license")).toBeInTheDocument();
    expect(hero.queryByText("Total kilometers")).not.toBeInTheDocument();
  });

  it("shows a scooter fallback when a cover fails and retries a changed cover", () => {
    const view = renderDetail("en", { ...scooter, coverUrl: "/first.png" });
    const hero = within(screen.getByRole("region", { name: "001 YAM" }));
    const image = hero.getByRole("img", {
      name: messages.en.scooters.card.photoAlt.replace("{code}", "001 YAM"),
    });
    fireEvent.error(image);
    expect(
      hero.getByRole("img", { name: messages.en.scooters.card.noPhoto }),
    ).toBeInTheDocument();
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterDetailPage
          scooter={{ ...scooter, coverUrl: "/second.png" }}
          scootersHref="/en/scooters"
        />
      </NextIntlClientProvider>,
    );
    expect(
      within(screen.getByRole("region", { name: "001 YAM" })).getByRole("img", {
        name: messages.en.scooters.card.photoAlt.replace("{code}", "001 YAM"),
      }),
    ).toHaveAttribute("src", "http://localhost:3000/second.png");
  });

  it("shows invalid insurance and ITP as fixed danger areas", () => {
    renderDetail("en", {
      ...scooter,
      hasCivDocument: true,
      registrationType: "national",
      registrationNumber: "B123ABC",
      rentalInsuranceStatus: "expired",
      itpStatus: "failed",
    });
    for (const label of ["Expired insurance", "Failed ITP"]) {
      const area = screen.getByText(label).closest('[data-slot="alert"]');
      expect(area).toHaveAttribute("role", "alert");
      expect(area).toHaveClass("bg-destructive-subtle");
      expect(screen.getByText(label).closest('[data-slot="badge"]')).toBeNull();
    }
    expect(screen.queryByText("Needs CIV")).not.toBeInTheDocument();
  });

  it("renders scooter details and actions", async () => {
    renderDetail();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "More details" }));

    expect(
      screen.getByRole("heading", { name: "001 YAM" }),
    ).toBeInTheDocument();
    expect(screen.getByText(scooter.vin)).toBeInTheDocument();
    expect(screen.queryByText("White")).not.toBeInTheDocument();
    expect(screen.getAllByText("125 cc")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Unregistered")[0]).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add registration" }),
    ).not.toBeInTheDocument();
    const moreActionsButton = screen.getByRole("button", {
      name: "More actions",
    });
    expect(moreActionsButton).toBeInTheDocument();
    expect(moreActionsButton).toHaveTextContent("");
    expect(moreActionsButton).not.toHaveClass("border-border");
    expect(moreActionsButton.querySelector("svg")).toHaveClass(
      "lucide-ellipsis-vertical",
    );
    expect(moreActionsButton.parentElement).not.toContainElement(
      screen.getByRole("region", { name: "001 YAM" }),
    );
    expect(
      screen.queryByRole("heading", { name: "Maintenance and repairs" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
  });

  it("shows a status badge only for deleted scooters", () => {
    renderDetail("en", { ...scooter, deletedAt: "2026-08-03T12:00:00.000Z" });

    expect(
      screen
        .getAllByText("Deleted")
        .some((element) => element.dataset.slot === "badge"),
    ).toBe(true);
  });

  it.each(["unregistered", "national", "local", "temporary"] as const)(
    "edits %s registration through the scooter edit page",
    async (registrationType) => {
      const browser = userEvent.setup();

      renderDetail("en", {
        ...scooter,
        registrationType,
        registrationNumber:
          registrationType === "unregistered" ? null : "CJ 12 ABC",
        registrationDate: "2026-01-16",
        requiredLicenseCategory: "A1",
      });

      await browser.click(screen.getByRole("button", { name: "More actions" }));
      expect(screen.queryByText("Edit registration")).not.toBeInTheDocument();
      expect(screen.queryByText("Add registration")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: /registration/i }),
      ).not.toBeInTheDocument();
      expect(
        document.querySelector('[data-slot="bottom-sheet-content"]'),
      ).not.toBeInTheDocument();
      await browser.click(await screen.findByText("Edit scooter"));
      expect(mocks.push).toHaveBeenCalledWith(
        `/en/scooters/${scooter.id}/edit`,
      );
    },
  );

  it("navigates to the edit page from the actions menu", async () => {
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Edit scooter"));

    expect(mocks.push).toHaveBeenCalledWith(`/en/scooters/${scooter.id}/edit`);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("soft-deletes the scooter with confirmation", async () => {
    mocks.apiFetch.mockResolvedValueOnce(undefined);
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Delete scooter"));
    const dialog = await screen.findByRole("dialog");
    await browser.click(
      within(dialog).getByRole("button", { name: "Delete scooter" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.delete(scooter.id),
        v1.common.noContentSchema,
        { method: "DELETE" },
      ),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/en/scooters");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});

it("refreshes mobile scooter details through the server route and unlocks after completion", async () => {
  const previousMatchMedia = window.matchMedia;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
  try {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <div>
          <PageRefreshSurface>
            <ScooterDetailPage scooter={scooter} scootersHref="/en/scooters" />
          </PageRefreshSurface>
        </div>
      </NextIntlClientProvider>,
    );
    const refresh = await screen.findByRole("button", {
      name: messages.en.shared.pullToRefresh.refresh,
    });
    fireEvent.click(refresh);
    await waitFor(() => expect(refresh).toBeEnabled());
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getAllByText("001 YAM").length).toBeGreaterThan(0);
  } finally {
    window.matchMedia = previousMatchMedia;
  }
});

function renderDetail(
  locale: SupportedLocale = "en",
  scooterOverride: v1.scooters.Scooter = scooter,
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterDetailPage
        scooter={scooterOverride}
        scootersHref={locale === "en" ? "/en/scooters" : "/scooters"}
      />
    </NextIntlClientProvider>,
  );
}

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({
    user: {
      effectiveScopes: {
        "problems.create": mocks.canReportProblem ? ["ALL"] : [],
        "persons.read": ["ALL"],
        "persons.create": ["ALL"],
        "persons.update": ["ALL"],
        "persons.archive": ["ALL"],
        "persons.audit.read": ["ALL"],
        "person_documents.read": ["ALL"],
        "person_documents.write": ["ALL"],
        "person_documents.delete": ["ALL"],
        "scooters.read": ["ALL"],
        "scooter_documents.read": ["ALL"],
        "scooters.create": ["ALL"],
        "scooters.update": ["ALL"],
        "scooters.archive": ["ALL"],
      },
    },
  }),
}));
