import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScooterEditForm } from "./ScooterEditForm";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    push: mocks.push,
  }),
}));

const scooter: v1.scooters.Scooter = {
  id: "scooter-1",
  vin: "JYARN23E0RA123456",
  brandId: "brand-yamaha",
  brand: "Yamaha",
  model: "NMAX",
  color: "White",
  manufactureYear: 2026,
  powertrainType: "combustion",
  engineType: null,
  engineCc: 125,
  powerKw: 8.5,
  purchasedOn: "2026-01-15",
  purchasePrice: "1500.00",
  purchaseCurrency: "RON",
  registrationType: "unregistered",
  plateNumber: null,
  registeredOn: null,
  registrationExpiresOn: null,
  requiredDriverLicenseType: "none",
  currentMileageKm: 1_200,
  notes: "Maker papers received",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T11:00:00.000Z",
  deletedAt: null,
};

const brands: v1.scooterBrands.ScooterBrand[] = [
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
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  mocks.push.mockReset();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("ScooterEditForm", () => {
  it("prefills the form from the scooter", () => {
    renderEditForm();

    expect(screen.getByLabelText("Current mileage (km)")).toHaveValue(1_200);
    expect(screen.getByLabelText("Color")).toHaveValue("White");
  });

  it("updates the scooter and returns to the detail page", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ...scooter, color: "Blue" });
    const browser = userEvent.setup();

    renderEditForm();
    await browser.clear(screen.getByLabelText("Color"));
    await browser.type(screen.getByLabelText("Color"), "Blue");
    await browser.clear(screen.getByLabelText("Current mileage (km)"));
    await browser.type(screen.getByLabelText("Current mileage (km)"), "1350");
    await browser.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        expect.objectContaining({
          method: "PATCH",
          json: expect.objectContaining({
            color: "Blue",
            currentMileageKm: 1_350,
          }),
        }),
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/scooters/scooter-1");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("requires color before sending the PATCH", async () => {
    const browser = userEvent.setup();

    renderEditForm();
    await browser.clear(screen.getByLabelText("Color"));
    await browser.click(screen.getByRole("button", { name: "Save" }));

    expect(
      (await screen.findAllByText("Color is required."))[0],
    ).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("never sends registration fields, which have their own sheet", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooter);
    const browser = userEvent.setup();

    renderEditForm();
    await browser.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    const [, , options] = mocks.apiFetch.mock.calls[0] as [
      string,
      unknown,
      { json: Record<string, unknown> },
    ];
    expect(options.json).not.toHaveProperty("registrationType");
    expect(options.json).not.toHaveProperty("plateNumber");
    expect(options.json).not.toHaveProperty("registeredOn");
    expect(options.json).not.toHaveProperty("registrationExpiresOn");
    expect(options.json).not.toHaveProperty("requiredDriverLicenseType");
  });
});

function renderEditForm(locale: SupportedLocale = "en") {
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
