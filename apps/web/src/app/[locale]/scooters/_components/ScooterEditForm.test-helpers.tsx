import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, vi } from "vitest";
import { ScooterEditForm } from "./ScooterEditForm";

vi.mock("./ScooterPhotos", () => ({
  ScooterPhotos: ({
    number,
    onSaved,
    onBusyChange,
  }: {
    number?: number;
    onSaved?: () => void;
    onBusyChange?: (busy: boolean) => void;
  }) => (
    <section>
      <h2>{String(number).padStart(2, "0")}. Photos</h2>
      <button type="button" onClick={() => onBusyChange?.(true)}>
        Start photo upload
      </button>
      {["add", "remove", "reorder"].map((operation) => (
        <button
          key={operation}
          type="button"
          onClick={() => {
            onSaved?.();
            onBusyChange?.(false);
          }}
        >
          {`Saved photo ${operation}`}
        </button>
      ))}
    </section>
  ),
}));

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    url: (path: string) => path,
    fetch: async (path: string, ...args: unknown[]) => {
      if (path === v1.scooters.ROUTES.insurance.list("scooter-1"))
        return { history: [], updatedAt: scooter.updatedAt };
      if (path === v1.scooters.ROUTES.itp.list("scooter-1"))
        return {
          inspections: [],
          status: "missing",
          validUntil: null,
          renewalRequired: true,
        };
      if (path === v1.scooters.ROUTES.documents.createEditorSession)
        return {
          id: "editor-session",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        };
      if (
        path ===
        v1.scooters.ROUTES.documents.discardEditorSession("editor-session")
      )
        return { ok: true };
      const result = await mocks.apiFetch(path, ...args);
      return path === v1.scooters.ROUTES.documents.startExtractionJob &&
        result?.extractedData
        ? {
            id: `job-${result.sourceId}`,
            sourceId: result.sourceId,
            documentType: result.documentType,
            status: "completed",
            result,
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          }
        : result;
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    push: mocks.push,
  }),
}));

export const scooter: v1.scooters.Scooter = {
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

export const brands: v1.scooterBrands.ScooterBrand[] = [
  {
    id: "brand-yamaha",
    name: "Yamaha",
    code: "YAM",
    scooterCount: 1,
    createdAt: "2026-06-25T10:00:00.000Z",
    updatedAt: "2026-06-25T10:00:00.000Z",
  },
];

beforeEach(() => {
  // Responsive hooks read the CSS media-query result, including mobile tests.
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    get matches() {
      const width = query.match(/width\s*<\s*(\d+)/);
      return width ? window.innerWidth < Number(width[1]) : false;
    },
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  access.user = { isSuperAdmin: true, effectiveScopes: {} };
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  mocks.push.mockReset();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

export async function openJsonImport(
  browser: ReturnType<typeof userEvent.setup>,
) {
  await browser.click(screen.getByRole("button", { name: "Document actions" }));
  await browser.click(
    await screen.findByRole("menuitem", { name: "Import JSON" }),
  );
}

export function renderEditForm(locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterEditForm
        scooter={scooter}
        scooterHref="/en/scooters/scooter-1"
        brands={brands}
      />
    </NextIntlClientProvider>,
  );
}

const access = vi.hoisted(() => ({
  user: { isSuperAdmin: true, effectiveScopes: {} as Record<string, string[]> },
}));

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => access,
}));

export async function openTechnical(
  browser: ReturnType<typeof userEvent.setup>,
) {
  await browser.click(screen.getByRole("button", { name: "Advanced details" }));
}

export async function closeTechnical(
  browser: ReturnType<typeof userEvent.setup>,
) {
  const button = screen.getByRole("button", { name: "Advanced details" });
  if (button.getAttribute("aria-expanded") === "true")
    await browser.click(button);
}

export function importStatus() {
  return screen
    .getAllByRole("status")
    .find((element) =>
      /field.*could not be interpreted/.test(element.textContent ?? ""),
    )!;
}

export { mocks, access };
