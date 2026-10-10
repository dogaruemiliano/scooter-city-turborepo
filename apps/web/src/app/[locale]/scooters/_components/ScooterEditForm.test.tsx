import { ApiError, v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
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
  engineCode: null,
  engineDisplacementCc: 125,
  powerKw: 8.5,
  registrationType: "unregistered",
  registrationNumber: null,
  registrationDate: null,
  temporaryRegistrationExpiresAt: null,
  requiredLicenseCategory: "none",
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
  it("imports an unsaved JSON patch, preserves omitted values and saves raw CIV values", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockResolvedValue(scooter);
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={{ ...scooter, civRawFields: { E: scooter.vin } }}
          brands={brands}
          scooterHref="/scooters/s"
        />
      </NextIntlClientProvider>,
    );
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    await browser.click(screen.getByRole("button", { name: "Add manually" }));
    fireEvent.change(screen.getByLabelText("Extracted data (JSON)"), {
      target: {
        value: JSON.stringify({
          powerKw: "9,25",
          color: null,
          civVersion: "2024",
          civRawFields: { "P.2": "9,25" },
        }),
      },
    });
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    expect(screen.getByRole("status")).toHaveTextContent("Updated 2 fields");
    await browser.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        expect.objectContaining({
          json: {
            powerKw: 9.25,
            civVersion: "2024",
            civRawFields: { E: scooter.vin, "P.2": "9,25" },
          },
        }),
      ),
    );
  });

  it("flags unresolved fields and dash conflicts, then clears warnings after manual review", async () => {
    const browser = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={scooter}
          brands={brands}
          scooterHref="/scooters/s"
        />
      </NextIntlClientProvider>,
    );
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    await browser.click(screen.getByRole("button", { name: "Add manually" }));
    fireEvent.change(screen.getByLabelText("Extracted data (JSON)"), {
      target: {
        value: JSON.stringify({
          color: "-",
          powerKw: null,
          maxTrainMassKg: "-",
        }),
      },
    });
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "AI could not resolve these fields: Power (kW)",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "these fields already contain values: Color",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Confirmed empty in the document",
    );
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Power (kW)"), {
      target: { value: "9" },
    });
    expect(screen.getByRole("alert")).not.toHaveTextContent("Power (kW)");
    await browser.click(
      screen.getByRole("button", { name: "I have checked these fields" }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // A fresh import must not inherit acknowledgement from the previous one.
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Power (kW)");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
  it("copies the extraction contract and handles clipboard denial with a selectable prompt", async () => {
    const browser = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={scooter}
          brands={brands}
          scooterHref="/scooters/s"
        />
      </NextIntlClientProvider>,
    );
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    await browser.click(
      screen.getByRole("button", { name: "Copy extraction prompt" }),
    );
    expect(copy).toHaveBeenCalledWith(
      expect.stringContaining('"key": "powerKw"'),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Prompt copied");
    copy.mockRejectedValueOnce(new Error("Denied"));
    await browser.click(
      screen.getByRole("button", { name: "Copy extraction prompt" }),
    );
    expect(
      (
        screen.getByLabelText(
          "Copy this prompt manually",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("civRawFields");
    copy.mockRestore();
  });

  it("keeps all fields unchanged when an import has an invalid value", async () => {
    const browser = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={scooter}
          brands={brands}
          scooterHref="/scooters/s"
        />
      </NextIntlClientProvider>,
    );
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    await browser.click(screen.getByRole("button", { name: "Add manually" }));
    fireEvent.change(screen.getByLabelText("Extracted data (JSON)"), {
      target: { value: '{"color":"Red","powerKw":"bad"}' },
    });
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(screen.getByRole("alert")).toHaveTextContent("powerKw");
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    await browser.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("opens a compact dialog and pastes clipboard JSON without applying it until confirmed", async () => {
    const browser = userEvent.setup();
    const read = vi
      .spyOn(navigator.clipboard, "readText")
      .mockResolvedValue('{"color":"Red"}');
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={scooter}
          brands={brands}
          scooterHref="/scooters/s"
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("Import from documents")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Extracted data (JSON)"),
    ).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    expect(
      screen.getByRole("dialog", { name: "Import from documents" }),
    ).toHaveAttribute("data-slot", "dialog-content");
    await browser.click(screen.getByRole("button", { name: "Paste JSON" }));
    expect(read).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Extracted data (JSON)")).toHaveValue(
      '{"color":"Red"}',
    );
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Color")).toHaveValue("Red");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    read.mockRestore();
  });

  it("supports manual paste when clipboard permission is denied and preserves the draft on close", async () => {
    const browser = userEvent.setup();
    const read = vi
      .spyOn(navigator.clipboard, "readText")
      .mockRejectedValue(new Error("Denied"));
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={scooter}
          brands={brands}
          scooterHref="/scooters/s"
        />
      </NextIntlClientProvider>,
    );
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    await browser.click(screen.getByRole("button", { name: "Paste JSON" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Clipboard access is unavailable",
    );
    fireEvent.change(screen.getByLabelText("Extracted data (JSON)"), {
      target: { value: '{"color":"Red"}' },
    });
    await browser.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    expect(screen.getByLabelText("Extracted data (JSON)")).toHaveValue(
      '{"color":"Red"}',
    );
    read.mockRestore();
  });

  it("uses a distinct bottom-sheet surface on mobile", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    try {
      const browser = userEvent.setup();
      render(
        <NextIntlClientProvider locale="en" messages={messages.en}>
          <ScooterEditForm
            scooter={scooter}
            brands={brands}
            scooterHref="/scooters/s"
          />
        </NextIntlClientProvider>,
      );
      await browser.click(screen.getByRole("button", { name: "Import JSON" }));
      const sheet = screen.getByRole("dialog", {
        name: "Import from documents",
      });
      expect(sheet).toHaveAttribute("data-slot", "bottom-sheet-popup");
      expect(sheet).toHaveClass("bg-popover", "text-popover-foreground");
      const instructions = sheet.querySelector(
        '[data-slot="import-instructions"]',
      ) as HTMLElement;
      expect(instructions).toHaveTextContent(
        messages.en.scooters.documentImport.steps.copy,
      );
      expect(
        within(instructions).getByRole("button", {
          name: "Copy extraction prompt",
        }),
      ).toBeEnabled();
      expect(
        sheet.querySelector('[data-slot="bottom-sheet-header"]'),
      ).not.toContainElement(
        within(instructions).getByRole("button", {
          name: "Copy extraction prompt",
        }),
      );
      expect(
        sheet.querySelector(
          "div.bg-background, section.bg-background, header.bg-background, footer.bg-background",
        ),
      ).toBeNull();
      expect(screen.getByRole("button", { name: "Paste JSON" })).toBeEnabled();
      await browser.click(screen.getByRole("button", { name: "Close" }));
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalWidth,
      });
    }
  });

  it("changes rubric hints without changing values and autocompletes saved vocabulary", async () => {
    const browser = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={{
            ...scooter,
            civVersion: "2024",
            engineCode: "ENGINE-1",
            engineDisplacementCc: 4500,
          }}
          scooterHref="/en/scooters/scooter-1"
          brands={brands}
          vocabulary={[{ field: "color", value: "Pearl white" }]}
        />
      </NextIntlClientProvider>,
    );
    const engineField = screen
      .getByLabelText("Engine code")
      .closest("[data-field-name]") as HTMLElement;
    expect(within(engineField).getByText("13")).toBeInTheDocument();
    await browser.click(
      screen.getByRole("combobox", { name: "CIV document model" }),
    );
    await browser.click(await screen.findByRole("option", { name: "2016" }));
    expect(within(engineField).getByText("14")).toBeInTheDocument();
    expect(screen.getByLabelText("Engine code")).toHaveValue("ENGINE-1");
    expect(screen.getByLabelText("Engine capacity (cm³)")).toHaveValue("4500");
    expect(screen.getByLabelText("Color")).toHaveAttribute("list");
    expect(
      document.querySelector('datalist option[value="Pearl white"]'),
    ).not.toBeNull();
    await browser.click(
      screen.getByRole("combobox", { name: "CIV document model" }),
    );
    await browser.click(
      await screen.findByRole("option", { name: "Unknown model" }),
    );
    expect(within(engineField).queryByText("14")).not.toBeInTheDocument();
  });

  it("shows and focuses backend CIV validation errors without losing the draft", async () => {
    mocks.apiFetch.mockRejectedValueOnce(
      new ApiError(400, "Validation failed", "BAD_REQUEST", [
        {
          path: "civIssuingAuthority",
          code: "custom",
          message: "Invalid office",
        },
      ]),
    );
    const browser = userEvent.setup();
    renderEditForm();
    await browser.type(
      screen.getByLabelText("Issuing RAR office"),
      "Office draft",
    );
    await browser.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Issuing RAR office")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    expect(screen.getByLabelText("Issuing RAR office")).toHaveValue(
      "Office draft",
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Issuing RAR office")).toHaveFocus(),
    );
  });

  it("prefills the form from the scooter", () => {
    renderEditForm();

    expect(screen.getByLabelText("Current mileage (km)")).toHaveValue("1200");
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

  it("allows clearing unknown color when sending the PATCH", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ...scooter, color: null });
    const browser = userEvent.setup();

    renderEditForm();
    await browser.clear(screen.getByLabelText("Color"));
    await browser.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalled());
    const options = mocks.apiFetch.mock.calls[0]![2];
    expect(options.json).toMatchObject({ color: null });
  });

  it("never sends registration fields, which have their own sheet", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooter);
    const browser = userEvent.setup();

    renderEditForm();
    await browser.type(screen.getByLabelText("Color"), " updated");
    await browser.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    const [, , options] = mocks.apiFetch.mock.calls[0] as [
      string,
      unknown,
      { json: Record<string, unknown> },
    ];
    expect(options.json).not.toHaveProperty("registrationType");
    expect(options.json).not.toHaveProperty("registrationNumber");
    expect(options.json).not.toHaveProperty("registrationDate");
    expect(options.json).not.toHaveProperty("temporaryRegistrationExpiresAt");
    expect(options.json).not.toHaveProperty("requiredLicenseCategory");
  });
  it("disables unchanged saves and sends only changed technical fields", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooter);
    const browser = userEvent.setup();
    renderEditForm();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await browser.type(screen.getByLabelText("Length (mm)"), "1900");
    await browser.type(screen.getByLabelText("Fuel tank capacity (L)"), "5.25");
    await browser.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json).toEqual({
      lengthMm: 1900,
      fuelTankCapacityLiters: 5.25,
    });
  });

  it("clears displacement when changing to electric", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooter);
    const browser = userEvent.setup();
    renderEditForm();
    await browser.click(
      screen.getByRole("combobox", { name: "Propulsion system" }),
    );
    await browser.click(
      await screen.findByRole("option", { name: "Electric" }),
    );
    await browser.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json).toEqual({
      powertrainType: "electric",
      engineDisplacementCc: null,
      ratedEngineRpm: null,
      fuelTankCapacityLiters: null,
      emissionsStandard: null,
      nationalEmissionsCode: null,
      fuelType: "electric",
      fuelTypeOther: null,
    });
  });

  it("preserves user input on request failure", async () => {
    mocks.apiFetch.mockRejectedValueOnce(new Error("offline"));
    const browser = userEvent.setup();
    renderEditForm();
    await browser.type(screen.getByLabelText("Variant"), "Sport");
    await browser.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Something went wrong. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Variant")).toHaveValue("Sport");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(mocks.push).not.toHaveBeenCalled();
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
