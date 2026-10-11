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
    url: (path: string) => path,
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
  it("fills the existing insurance document's policy and saves the normalized premium", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockResolvedValue(scooter);
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={{
            ...scooter,
            insurancePolicies: [
              {
                id: "policy-1",
                insuredName: null,
                validFrom: null,
                validUntil: null,
                premiumAmount: null,
                currency: null,
                documentVin: scooter.vin,
                vinReviewConfirmed: false,
                createdAt: scooter.createdAt,
                updatedAt: scooter.updatedAt,
              },
            ],
            documents: [
              {
                id: "insurance-file",
                type: "insurance",
                insurancePolicyId: "policy-1",
                fileName: "insurance.pdf",
                contentType: "application/pdf",
                byteSize: 100,
                createdAt: scooter.createdAt,
                contentUrl: "/insurance.pdf",
              },
            ],
          }}
          brands={brands}
          scooterHref="/scooters/s"
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText("Insured name")).toHaveValue("");
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    await browser.click(screen.getByRole("button", { name: "Edit JSON" }));
    fireEvent.change(screen.getByLabelText("Extracted data (JSON)"), {
      target: {
        value: JSON.stringify({
          documentVins: [
            {
              fileName: "insurance.pdf",
              documentType: "insurance",
              vin: scooter.vin,
            },
          ],
          insurancePolicies: [
            {
              insuredName: "Test Asigurat SRL",
              validFrom: "2026-01-01",
              validUntil: "2026-12-31",
              premiumAmount: "250,50",
              currency: "RON",
              documentVin: scooter.vin,
              sourceFileNames: ["insurance.pdf"],
            },
          ],
        }),
      },
    });
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(screen.getAllByLabelText("Insured name")).toHaveLength(1);
    expect(screen.getByLabelText("Insured name")).toHaveValue(
      "Test Asigurat SRL",
    );
    expect(screen.getByLabelText("Total premium")).toHaveValue("250.5");
    await browser.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        expect.objectContaining({
          json: expect.objectContaining({
            insurancePolicies: [
              expect.objectContaining({
                id: "policy-1",
                insuredName: "Test Asigurat SRL",
                premiumAmount: 250.5,
                currency: "RON",
              }),
            ],
          }),
        }),
      ),
    );
  });

  it("requires manual confirmation for unreadable VINs and never imports mismatched documents", async () => {
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
    await browser.click(screen.getByRole("button", { name: "Edit JSON" }));
    const input = screen.getByLabelText("Extracted data (JSON)");
    fireEvent.change(input, {
      target: {
        value: JSON.stringify({
          color: "Red",
          documentVins: [
            {
              fileName: "other.pdf",
              documentType: "insurance",
              vin: "LXYTCKP05P0000002",
            },
          ],
        }),
      },
    });
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Document VINs do not match",
    );
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    fireEvent.change(input, {
      target: {
        value: JSON.stringify({
          color: "Red",
          documentVins: [
            { fileName: "civ.pdf", documentType: "civ", vin: null },
          ],
        }),
      },
    });
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    await browser.click(
      screen.getByRole("checkbox", {
        name: "I checked that all documents refer to this scooter",
      }),
    );
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(screen.getByLabelText("Color")).toHaveValue("Red");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

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
    await browser.click(screen.getByRole("button", { name: "Edit JSON" }));
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
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 field could not be interpreted.",
    );
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

  it("lists unresolved fields and highlights them until their values change", async () => {
    const browser = userEvent.setup();
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={{ ...scooter, civVersion: "2024" }}
          brands={brands}
          scooterHref="/scooters/s"
        />
      </NextIntlClientProvider>,
    );
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    await browser.click(screen.getByRole("button", { name: "Edit JSON" }));
    fireEvent.change(screen.getByLabelText("Extracted data (JSON)"), {
      target: {
        value: JSON.stringify({
          color: "-",
          powerKw: null,
          maxTrainMassKg: "-",
          civRawFields: { "P.2": null, "15": null, Mențiuni: "" },
        }),
      },
    });
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 fields could not be interpreted.",
    );
    expect(
      within(screen.getByRole("status"))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(expect.arrayContaining(["Power (kW) (P.2)", "Color"]));
    for (const name of ["powerKw", "color"]) {
      expect(
        container.querySelector(`[data-field-name="${name}"]`),
      ).toHaveAttribute("data-warning", "true");
    }
    expect(
      container.querySelector('[data-field-name="maxTrainMassKg"]'),
    ).not.toHaveAttribute("data-warning");
    expect(screen.getByLabelText("Power (kW)")).toHaveAccessibleDescription(
      "Check these CIV rubrics against the document: P.2.",
    );
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    expect(
      screen.queryByText(/Confirmed empty in the document/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "I have checked these fields" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Power (kW)"), {
      target: { value: "9" },
    });
    expect(
      container.querySelector('[data-field-name="powerKw"]'),
    ).not.toHaveAttribute("data-warning");
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 field could not be interpreted.",
    );
    expect(
      within(screen.getByRole("status"))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Color"]);
    fireEvent.change(screen.getByLabelText("Color"), {
      target: { value: "Blue" },
    });
    expect(
      container.querySelector('[data-field-name="civMentions"]'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // A fresh import flags the freshly unresolved fields again.
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 fields could not be interpreted.",
    );
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
  it("copies the extraction contract and handles clipboard denial with a selectable prompt", async () => {
    const browser = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={{
            ...scooter,
            documents: [
              {
                id: "civ-file",
                type: "civ",
                fileName: "CIV.pdf",
                contentType: "application/pdf",
                byteSize: 100,
                createdAt: scooter.createdAt,
                contentUrl: "/CIV.pdf",
              },
            ],
          }}
          brands={brands}
          scooterHref="/scooters/s"
        />
      </NextIntlClientProvider>,
    );
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    await browser.click(
      screen.getByRole("button", { name: "Copy extraction prompt" }),
    );
    expect(copy.mock.calls[0]?.[0]).toMatch(/"schemaVersion"\s*:\s*2/);
    expect(copy.mock.calls[0]?.[0]).toMatch(/"sourceId"\s*:\s*"civ-file"/);
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
    ).toMatch(/"sourceId"\s*:\s*"civ-file"/);
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
    await browser.click(screen.getByRole("button", { name: "Edit JSON" }));
    fireEvent.change(screen.getByLabelText("Extracted data (JSON)"), {
      target: { value: '{"color":"Red","powerKw":"bad"}' },
    });
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(screen.getByRole("alert")).toHaveTextContent("powerKw");
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    await browser.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("opens a compact dialog and reads a JSON file without applying it until confirmed", async () => {
    const browser = userEvent.setup();
    const json = '{"color":"Red"}';
    const file = new File([json], "scuter.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: vi.fn(async () => json) });
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
    await browser.upload(
      screen.getByLabelText("Upload JSON", { selector: "input" }),
      file,
    );
    expect(
      await screen.findByText("File ready: scuter.json"),
    ).toBeInTheDocument();
    expect(file.text).toHaveBeenCalledOnce();
    expect(
      screen.queryByLabelText("Extracted data (JSON)"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Color")).toHaveValue("Red");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("supports optional JSON editing and preserves the draft on close", async () => {
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
    await browser.click(screen.getByRole("button", { name: "Edit JSON" }));
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
      ).toBeDisabled();
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
      expect(screen.getByRole("button", { name: "Upload JSON" })).toBeEnabled();
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
