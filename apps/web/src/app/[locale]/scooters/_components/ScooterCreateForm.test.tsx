import { ApiError, v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScooterCreateForm } from "./ScooterCreateForm";
import { DEFAULT_COMBUSTION_CYLINDER_CAPACITY_CC } from "./scooter-form";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
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

const createdScooter: v1.scooters.Scooter = {
  id: "scooter-1",
  vin: "JYARN23E0RA123456",
  brand: "Yamaha",
  model: "NMAX",
  color: "White",
  manufactureYear: 2026,
  powertrainType: "combustion",
  cylinderCapacityCc: 125,
  purchasedOn: v1.common.dateOnlyToday(),
  registrationStatus: "unregistered",
  notes: "Maker papers received",
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

describe("ScooterCreateForm", () => {
  it("renders combustion defaults with required scooter fields", () => {
    renderCreateForm();

    expect(
      screen.getByRole("heading", { name: "Add scooter" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Technical")).toBeInTheDocument();
    expect(screen.getByText("Purchase")).toBeInTheDocument();
    expect(requiredLabel("Color")).toHaveTextContent(/Color\s*\*/);
    expect(screen.getByRole("button", { name: "Combustion" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Electric" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByLabelText("Cylinder capacity (cc)")).toHaveValue(
      Number(DEFAULT_COMBUSTION_CYLINDER_CAPACITY_CC),
    );
  });

  it("hides and clears cylinder capacity for electric scooters", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    const cylinderCapacityInput = screen.getByLabelText(
      "Cylinder capacity (cc)",
    );
    expect(cylinderCapacityInput).toHaveValue(
      Number(DEFAULT_COMBUSTION_CYLINDER_CAPACITY_CC),
    );
    await browser.clear(cylinderCapacityInput);
    await browser.type(cylinderCapacityInput, "125");
    await browser.click(screen.getByRole("button", { name: "Electric" }));

    expect(
      screen.queryByLabelText("Cylinder capacity (cc)"),
    ).not.toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Combustion" }));

    expect(screen.getByLabelText("Cylinder capacity (cc)")).toHaveValue(
      Number(DEFAULT_COMBUSTION_CYLINDER_CAPACITY_CC),
    );
  });

  it("shows frontend required validation while keeping default combustion cc", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));

    expect(await screen.findByText("Scooter not created")).toBeInTheDocument();
    expect(screen.getAllByText("Color is required.")[0]).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Cylinder capacity is required for combustion scooters.",
      ),
    ).not.toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("renders the Romanian purchase date placeholders", () => {
    renderCreateForm("ro");

    expect(screen.getByLabelText("Achiziționat la")).toHaveAttribute(
      "placeholder",
      "ZZ",
    );
    expect(screen.getByLabelText("Achiziționat la LL")).toHaveAttribute(
      "placeholder",
      "LL",
    );
    expect(screen.getByLabelText("Achiziționat la AAAA")).toHaveAttribute(
      "placeholder",
      "AAAA",
    );
  });

  it("rejects future purchase dates before submitting", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredScooterForm(browser, {
      purchasedOn: addDateOnlyDays(v1.common.dateOnlyToday(), 1),
    });
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));

    expect(
      await screen.findAllByText("Purchased on must be today or earlier."),
    ).toHaveLength(2);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("submits the normalized create payload", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredScooterForm(browser);
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.create,
        v1.scooters.scooterSchema,
        {
          method: "POST",
          json: {
            vin: "JYARN23E0RA123456",
            brand: "Yamaha",
            model: "NMAX",
            color: "White",
            manufactureYear: 2026,
            powertrainType: "combustion",
            cylinderCapacityCc: 125,
            purchasedOn: v1.common.dateOnlyToday(),
            notes: "Maker papers received",
          },
        },
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/scooters");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("maps duplicate VIN conflicts to the VIN field", async () => {
    mocks.apiFetch.mockRejectedValueOnce(
      new ApiError(409, "Scooter VIN already exists", "SCOOTER_VIN_CONFLICT", {
        field: "vin",
      }),
    );
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredScooterForm(browser);
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));

    expect(
      (await screen.findAllByText("Scooter VIN already exists"))[0],
    ).toBeInTheDocument();
    expect(screen.getByLabelText("VIN")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});

function renderCreateForm(locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterCreateForm
        scootersHref={locale === "en" ? "/en/scooters" : "/scooters"}
      />
    </NextIntlClientProvider>,
  );
}

async function fillRequiredScooterForm(
  browser: ReturnType<typeof userEvent.setup>,
  overrides: { purchasedOn?: string } = {},
) {
  await browser.type(screen.getByLabelText("VIN"), "jyarn23e0ra123456");
  await browser.type(screen.getByLabelText("Brand"), "Yamaha");
  await browser.type(screen.getByLabelText("Model"), "NMAX");
  await browser.type(screen.getByLabelText("Color"), "White");
  await browser.type(screen.getByLabelText("Manufacture year"), "2026");
  await browser.clear(screen.getByLabelText("Cylinder capacity (cc)"));
  await browser.type(screen.getByLabelText("Cylinder capacity (cc)"), "125");
  await fillDateParts(
    browser,
    "Purchased on",
    overrides.purchasedOn ?? v1.common.dateOnlyToday(),
  );
  await browser.type(screen.getByLabelText("Notes"), "Maker papers received");
}

async function fillDateParts(
  browser: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  const [year, month, day] = value.split("-");

  await browser.type(screen.getByLabelText(label), day ?? "");
  await browser.type(screen.getByLabelText(`${label} MM`), month ?? "");
  await browser.type(screen.getByLabelText(`${label} YYYY`), year ?? "");
}

function requiredLabel(text: string) {
  return screen.getByText(text).closest("div") ?? screen.getByText(text);
}

function addDateOnlyDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
