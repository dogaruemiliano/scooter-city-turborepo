// Import this fixture before component modules so its hoisted mocks are registered.
// Vitest isolates each suite, giving every file its own mock and hook state.
import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider } from "react-hook-form";
import { FormSummary } from "@/components/form/FormSummary";
import { useZodForm } from "@/lib/form/use-zod-form";
import { ScooterEditorFields } from "./ScooterEditorFields";
import { ScooterImportReviewProvider } from "./ScooterImportReview";
import {
  scooterCreateFormSchema,
  scooterEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";
import { scooterEditorMessage } from "./scooter-editor-messages";
import { useScooterDocuments } from "./useScooterDocuments";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { ScooterCreateForm } from "./ScooterCreateForm";

vi.mock("./ScooterPhotos", () => ({
  ScooterPhotos: ({
    number,
    onDraftsChange,
  }: {
    number?: number;
    onDraftsChange?: (
      drafts: v1.scooters.ScooterPhotoDraft[],
      blocked: boolean,
    ) => void;
  }) => (
    <section>
      <h2>{String(number).padStart(2, "0")}. Photos</h2>
      {onDraftsChange ? (
        <button
          type="button"
          onClick={() =>
            onDraftsChange(
              [
                {
                  uploadToken: "draft-token",
                  fileName: "front.jpg",
                  caption: "Front view",
                  isPublic: true,
                  type: "GALLERY_COVER",
                },
              ],
              false,
            )
          }
        >
          Stage test photo
        </button>
      ) : null}
    </section>
  ),
}));

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: async (path: string, ...args: unknown[]) => {
      if (path === v1.scooters.ROUTES.nextFleetNumber)
        return { fleetNumber: 7 };
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
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

const brands: v1.scooterBrands.ScooterBrand[] = [
  {
    id: "brand-1",
    name: "Yamaha",
    code: "YAM",
    scooterCount: 0,
    createdAt: "2026-06-25T10:00:00.000Z",
    updatedAt: "2026-06-25T10:00:00.000Z",
  },
];

const createdScooter: v1.scooters.Scooter = {
  id: "scooter-1",
  vin: "JYARN23E0RA123456",
  brandId: "brand-1",
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
  notes: "Maker papers received",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T10:00:00.000Z",
  deletedAt: null,
};

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

  mocks.apiFetch.mockReset();
  mocks.push.mockReset();
  mocks.refresh.mockReset();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

afterEach(() => vi.unstubAllGlobals());

/** Controls stay independently covered while the production create form shows one step. */
function CreateControlsHarness({
  brands: initialBrands,
}: {
  brands: v1.scooterBrands.ScooterBrand[];
}) {
  const t = useTranslations("scooters");
  const [createdBrands, setCreatedBrands] = useState<
    v1.scooterBrands.ScooterBrand[]
  >([]);
  const documents = useScooterDocuments();
  const form = useZodForm<ScooterEditorValues, v1.scooters.CreateScooterInput>(
    scooterCreateFormSchema,
    {
      defaultValues: {
        ...scooterEditorDefaults(),
        registrationType: "unregistered",
      },
      labelFor: (path) => t(`fields.${path === "brandId" ? "brand" : path}`),
      messageOverride: (issue, path) => scooterEditorMessage(issue, path, t),
    },
  );
  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(async (input) => {
          await mocks.apiFetch(
            v1.scooters.ROUTES.create,
            v1.scooters.scooterSchema,
            { method: "POST", json: input },
          );
        })}
      >
        <FormSummary title={t("feedback.createErrorTitle")} />
        <ScooterImportReviewProvider editing={false}>
          <ScooterEditorFields
            brands={[...initialBrands, ...createdBrands]}
            persistedPolicyIds={[]}
            documents={documents}
            editing={false}
            disabled={false}
            onRawFields={() => {}}
            rawFields={{}}
            onBrandCreated={(brand) =>
              setCreatedBrands((current) => [...current, brand])
            }
          />
        </ScooterImportReviewProvider>
        <button type="submit">{t("actions.create")}</button>
      </form>
    </FormProvider>
  );
}

function renderControls(locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <CreateControlsHarness brands={brands} />
    </NextIntlClientProvider>,
  );
}

function renderWizard(locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterCreateForm scootersHref="/en/scooters" brands={brands} />
    </NextIntlClientProvider>,
  );
}

async function fillWizardIdentity(browser: ReturnType<typeof userEvent.setup>) {
  // These scenarios test form behavior rather than per-keystroke VIN handling.
  fireEvent.change(screen.getByRole("textbox", { name: "VIN" }), {
    target: { value: "jyarn23e0ra123456" },
  });
  await selectBrand(browser, "Yamaha");
  expect(
    within(
      screen.getByRole("radiogroup", { name: "Propulsion system" }),
    ).getByRole("radio", { checked: true }),
  ).toHaveAttribute("value", "combustion");
}

async function selectBrand(
  browser: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const trigger = screen.getByRole("combobox", { name: "Brand" });
  await browser.click(trigger);
  await browser.click(
    await screen.findByRole("option", { name: new RegExp(name) }),
  );
  await waitFor(() =>
    expect(trigger).toHaveAttribute("aria-expanded", "false"),
  );
}

async function fillRequiredScooterForm(
  browser: ReturnType<typeof userEvent.setup>,
) {
  // Optional field normalization is covered by its own test. Keep shared setup
  // to the identity fields needed to submit the controls harness.
  fireEvent.change(screen.getByRole("textbox", { name: "VIN" }), {
    target: { value: "jyarn23e0ra123456" },
  });
  await selectBrand(browser, "Yamaha");
  await chooseSelectOption(browser, "Propulsion system", "Combustion");
}

async function chooseSelectOption(
  browser: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  // Role queries avoid jsdom resolving labels for every element in the CIV form.
  const trigger = screen.getByRole("combobox", { name: label });
  await browser.click(trigger);
  await browser.click(await screen.findByRole("option", { name: option }));
  await waitFor(() =>
    expect(trigger).toHaveAttribute("aria-expanded", "false"),
  );
}

async function fillDateParts(
  browser: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  const [year, month, day] = value.split("-");

  await browser.type(screen.getByRole("textbox", { name: label }), day ?? "");
  await browser.type(
    screen.getByRole("textbox", { name: `${label} MM` }),
    month ?? "",
  );
  await browser.type(
    screen.getByRole("textbox", { name: `${label} YYYY` }),
    year ?? "",
  );
}

function requiredLabel(text: string) {
  return screen.getByText(text).closest("div") ?? screen.getByText(text);
}

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: { isSuperAdmin: true } }),
}));

export {
  mocks,
  brands,
  createdScooter,
  CreateControlsHarness,
  renderControls,
  renderWizard,
  fillWizardIdentity,
  selectBrand,
  fillRequiredScooterForm,
  chooseSelectOption,
  fillDateParts,
  requiredLabel,
};
