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
import { scooterEditorDefaults } from "./scooter-editor-schema";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    url: (path: string) => path,
    fetch: async (path: string, ...args: unknown[]) => {
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

async function openJsonImport(browser: ReturnType<typeof userEvent.setup>) {
  await browser.click(screen.getByRole("button", { name: "Document actions" }));
  await browser.click(
    await screen.findByRole("menuitem", { name: "Import JSON" }),
  );
}

describe("ScooterEditForm", () => {
  it("shows every attached document type, including other documents", () => {
    const documents: NonNullable<v1.scooters.Scooter["documents"]> =
      v1.scooters.SCOOTER_DOCUMENT_TYPES.map((type) => ({
        id: `document-${type}`,
        type,
        fileName: `${type}.pdf`,
        contentType: "application/pdf",
        byteSize: 100,
        contentUrl: `/documents/${type}`,
        createdAt: scooter.createdAt,
        updatedAt: scooter.updatedAt,
      }));
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={{ ...scooter, documents }}
          brands={brands}
          scooterHref="/en/scooters"
        />
      </NextIntlClientProvider>,
    );
    expect(
      document.querySelectorAll('[data-slot="document-preview-card"]'),
    ).toHaveLength(documents.length);
    for (const document of documents)
      expect(
        screen.getByRole("button", { name: `Preview ${document.fileName}` }),
      ).toBeInTheDocument();
    expect(
      screen.getByText("Other document", { exact: true }),
    ).toBeInTheDocument();
  });

  it("previews saved client copies and can undo removing their original before saving", async () => {
    const browser = userEvent.setup();
    const document: v1.scooters.ScooterDocument = {
      id: "saved-civ",
      type: "civ",
      fileName: "original.jpg",
      contentType: "image/jpeg",
      byteSize: 100,
      createdAt: scooter.createdAt,
      contentUrl: "/original.jpg",
      clientCopy: {
        fileName: "client.jpg",
        contentType: "image/jpeg",
        byteSize: 100,
        contentUrl: "/client.jpg",
      },
    };
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={{ ...scooter, documents: [document] }}
          brands={brands}
          scooterHref="/en/scooters"
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Fill automatically")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add document" }),
    ).toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Preview client.jpg" }),
    );
    const viewer = await screen.findByRole("dialog", { name: "client.jpg" });
    expect(
      within(viewer).getByRole("img", { name: "client.jpg" }),
    ).toBeInTheDocument();
    await browser.click(
      within(viewer).getByRole("button", { name: "Close preview" }),
    );
    await browser.click(
      screen.getByRole("button", { name: "Remove original.jpg" }),
    );
    expect(
      screen.queryByRole("button", { name: "Preview client.jpg" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview original.jpg" }),
    ).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Undo removal" }));
    expect(
      screen.getByRole("button", { name: "Preview original.jpg" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview client.jpg" }),
    ).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("preserves existing engine, homologation, and license instead of applying create defaults", () => {
    expect(
      scooterEditorDefaults({
        ...scooter,
        powertrainType: "electric",
        vehicleCategory: "L3e",
        registrationType: "local",
        requiredLicenseCategory: "A1",
      }),
    ).toMatchObject({
      powertrainType: "electric",
      vehicleCategory: "L3e",
      requiredLicenseCategory: "A1",
    });
    expect(
      scooterEditorDefaults({ ...scooter, vehicleCategory: null })
        .vehicleCategory,
    ).toBe("");
  });
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
    const headings = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    const galleryIndex = headings.findIndex((text) =>
      text?.includes("02. Photos"),
    );
    expect(galleryIndex).toBeGreaterThan(0);
    expect(headings[galleryIndex - 1]).toMatch(/01/);
    expect(headings[galleryIndex + 1]).toMatch(/03/);

    expect(screen.getByLabelText("Insured name")).toHaveValue("");
    await openJsonImport(browser);
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
    await browser.click(screen.getByRole("button", { name: /^Save changes$/ }));
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

  it("uses the known scooter VIN for unreadable sources and never imports mismatched documents", async () => {
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
    await openJsonImport(browser);
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
    expect(
      screen.queryByRole("checkbox", {
        name: "I checked that all documents refer to this scooter",
      }),
    ).not.toBeInTheDocument();
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
    await openJsonImport(browser);
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
    expect(importStatus()).toHaveTextContent(
      "1 field could not be interpreted.",
    );
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        expect.objectContaining({
          json: {
            sessionId: "editor-session",
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
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={{ ...scooter, civVersion: "2024" }}
          brands={brands}
          scooterHref="/scooters/s"
        />
      </NextIntlClientProvider>,
    );
    await openJsonImport(browser);
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
    expect(importStatus()).toHaveTextContent(
      "2 fields could not be interpreted.",
    );
    expect(
      within(importStatus())
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(expect.arrayContaining(["Power (kW) (P.2)", "Color"]));
    await openTechnical(browser);
    for (const name of ["powerKw"]) {
      expect(
        document.querySelector(`[data-field-name="${name}"]`),
      ).toHaveAttribute("data-warning", "true");
    }
    expect(
      document.querySelector('[data-field-name="maxTrainMassKg"]'),
    ).not.toHaveAttribute("data-warning");
    expect(
      screen.getByRole("textbox", { name: "Power (kW)" }),
    ).toHaveAccessibleDescription(
      "Check these CIV rubrics against the document: P.2.",
    );
    expect(screen.getByRole("textbox", { name: "Color" })).toHaveValue("White");
    expect(
      screen.queryByText(/Confirmed empty in the document/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "I have checked these fields" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Power (kW)" }), {
      target: { value: "9" },
    });
    expect(
      document.querySelector('[data-field-name="powerKw"]'),
    ).not.toHaveAttribute("data-warning");
    expect(importStatus()).toHaveTextContent(
      "1 field could not be interpreted.",
    );
    expect(
      within(importStatus())
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Color"]);
    fireEvent.change(screen.getByRole("textbox", { name: "Color" }), {
      target: { value: "Blue" },
    });

    expect(
      screen.queryByText(/field.*could not be interpreted/),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Color" }), {
      target: { value: "White" },
    });
    expect(
      document.querySelector('[data-field-name="color"]'),
    ).not.toHaveAttribute("data-warning");
    expect(
      screen.queryByText(/field.*could not be interpreted/),
    ).not.toBeInTheDocument();
    // A fresh import flags the freshly unresolved fields again.
    await openJsonImport(browser);
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(importStatus()).toHaveTextContent(
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
    await openJsonImport(browser);
    await browser.click(
      screen.getByRole("button", { name: "Copy extraction prompt" }),
    );
    expect(copy.mock.calls[0]?.[0]).toMatch(/"schemaVersion"\s*:\s*2/);
    expect(copy.mock.calls[0]?.[0]).toMatch(/"sourceId"\s*:\s*"civ-file"/);
    expect(screen.getByText("Prompt copied")).toBeInTheDocument();
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
    await openJsonImport(browser);
    await browser.click(screen.getByRole("button", { name: "Edit JSON" }));
    fireEvent.change(screen.getByLabelText("Extracted data (JSON)"), {
      target: { value: '{"color":"Red","powerKw":"bad"}' },
    });
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(screen.getByRole("alert")).toHaveTextContent("powerKw");
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    await browser.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
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
    await openJsonImport(browser);
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
    await openJsonImport(browser);
    await browser.click(screen.getByRole("button", { name: "Edit JSON" }));
    fireEvent.change(screen.getByLabelText("Extracted data (JSON)"), {
      target: { value: '{"color":"Red"}' },
    });
    await browser.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await openJsonImport(browser);
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
      await openJsonImport(browser);
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
    await openTechnical(browser);
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
    await openTechnical(browser);
    await browser.type(
      screen.getByLabelText("Issuing RAR office"),
      "Office draft",
    );
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
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

  it("matches the create panels and preserves saved registration and licence values", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockResolvedValue(scooter);
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={{
            ...scooter,
            registrationType: "local",
            registrationNumber: "VL-BUJORENI-175",
            requiredLicenseCategory: "A1",
          }}
          scooterHref="/en/scooters/scooter-1"
          brands={brands}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: /Scooter details/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "Propulsion system" }),
    ).toBeInTheDocument();
    await openTechnical(browser);
    expect(
      screen.getByRole("button", { name: "Advanced details" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("heading", { name: "Registration document details" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Power (kW)")).toHaveValue("8.5");
    await closeTechnical(browser);
    expect(screen.getByLabelText("VIN")).toHaveValue(scooter.vin);
    expect(screen.getByLabelText("Model")).toHaveValue("NMAX");
    expect(screen.getByLabelText("Plate number")).toHaveValue(
      "VL-BUJORENI-175",
    );
    expect(
      screen.getByRole("combobox", { name: /Required driver license/ }),
    ).toHaveTextContent("A1");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await browser.clear(screen.getByLabelText("Plate number"));
    await browser.type(
      screen.getByLabelText("Plate number"),
      "VL-BUJORENI-176",
    );
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        {
          method: "PATCH",
          json: {
            sessionId: "editor-session",
            registrationNumber: "VL-BUJORENI-176",
          },
        },
      ),
    );
  });

  it.each(["add", "remove", "reorder"])(
    "enables Save after a photo %s and returns without a redundant scooter write",
    async (operation) => {
      const browser = userEvent.setup();
      renderEditForm();
      const save = screen.getByRole("button", { name: "Save changes" });
      expect(save).toBeDisabled();
      await browser.click(
        screen.getByRole("button", { name: "Start photo upload" }),
      );
      expect(save).toBeDisabled();
      await browser.click(
        screen.getByRole("button", { name: `Saved photo ${operation}` }),
      );
      expect(save).toBeEnabled();
      await browser.click(save);
      expect(mocks.push).toHaveBeenCalledWith("/en/scooters/scooter-1");
      expect(mocks.refresh).toHaveBeenCalledOnce();
      expect(mocks.apiFetch).not.toHaveBeenCalled();
    },
  );

  it("still saves changed scooter fields after a gallery change", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockResolvedValue(scooter);
    renderEditForm();
    await browser.click(
      screen.getByRole("button", { name: "Saved photo add" }),
    );
    await browser.clear(screen.getByLabelText("Color"));
    await browser.type(screen.getByLabelText("Color"), "Blue");
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        {
          method: "PATCH",
          json: { sessionId: "editor-session", color: "Blue" },
        },
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/scooters/scooter-1");
  });

  it("edits the fuel system from the propulsion section", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...scooter,
      fuelSystem: "carburetor",
    });
    const browser = userEvent.setup();
    renderEditForm();
    const group = screen.getByRole("radiogroup", { name: "Fuel system" });
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    expect(within(group).queryByRole("radio", { name: /Unknown$/ })).toBeNull();
    expect(
      within(group)
        .getAllByRole("radio")
        .some((radio) => (radio as HTMLInputElement).checked),
    ).toBe(false);
    await browser.click(
      within(group).getByRole("radio", { name: "Carburetor" }),
    );
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        expect.objectContaining({
          json: expect.objectContaining({ fuelSystem: "carburetor" }),
        }),
      ),
    );
  });

  it("prefills and saves a changed internal number with the brand code", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ...scooter, fleetNumber: 42 });
    const browser = userEvent.setup();
    renderEditForm();
    const input = screen.getByRole("textbox", { name: "Internal number" });
    expect(input).toHaveValue(String(scooter.fleetNumber));
    expect(screen.getByText("YAM")).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    await browser.clear(input);
    await browser.type(input, "42");
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        expect.objectContaining({
          method: "PATCH",
          json: expect.objectContaining({ fleetNumber: 42 }),
        }),
      ),
    );
  });

  it("updates the scooter and returns to the detail page", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ...scooter, color: "Blue" });
    const browser = userEvent.setup();

    renderEditForm();
    await browser.clear(screen.getByLabelText("Color"));
    await browser.type(screen.getByLabelText("Color"), "Blue");
    await browser.clear(screen.getByLabelText("Current mileage (km)"));
    await browser.type(screen.getByLabelText("Current mileage (km)"), "1350");
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));

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
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalled());
    const options = mocks.apiFetch.mock.calls[0]![2];
    expect(options.json).toMatchObject({ color: null });
  });

  it("does not send unchanged registration fields", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooter);
    const browser = userEvent.setup();

    renderEditForm();
    await browser.type(screen.getByLabelText("Color"), " updated");
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));

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
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await openTechnical(browser);
    await browser.type(screen.getByLabelText("Length (mm)"), "1900");
    await browser.type(screen.getByLabelText("Fuel tank capacity (L)"), "5.25");
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json).toEqual({
      sessionId: "editor-session",
      lengthMm: 1900,
      fuelTankCapacityLiters: 5.25,
    });
  });

  it("clears displacement when changing to electric", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooter);
    const browser = userEvent.setup();
    renderEditForm();
    await browser.click(screen.getByRole("radio", { name: "Electric" }));
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json).toEqual({
      sessionId: "editor-session",
      powertrainType: "electric",
      fuelSystem: null,
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
    await openTechnical(browser);
    await browser.type(screen.getByLabelText("Variant"), "Sport");
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Something went wrong. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await openTechnical(browser);
    expect(screen.getByLabelText("Variant")).toHaveValue("Sport");
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

const access = vi.hoisted(() => ({
  user: { isSuperAdmin: true, effectiveScopes: {} as Record<string, string[]> },
}));
vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => access,
}));

it("saves scooter fields without document writes or inline brand creation for a limited operator", async () => {
  access.user = {
    isSuperAdmin: false,
    effectiveScopes: {
      "scooters.update": ["ALL"],
      "scooter_documents.read": ["ALL"],
      "scooter_brands.read": ["ALL"],
    },
  };
  mocks.apiFetch.mockResolvedValue(scooter);
  const browser = userEvent.setup();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterEditForm
        scooter={{
          ...scooter,
          civVersion: "2024",
          insurancePolicies: [
            {
              id: "policy-readonly",
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
        }}
        brands={brands}
        scooterHref="/scooters/s"
      />
    </NextIntlClientProvider>,
  );
  expect(
    screen.queryByRole("button", { name: "Import JSON" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: messages.en.scooters.brandPicker.addNew,
    }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Insured name")).toBeDisabled();
  await openTechnical(browser);
  await browser.type(screen.getByLabelText("Variant"), "Sport");
  await closeTechnical(browser);
  await browser.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalled());
  expect(mocks.apiFetch).toHaveBeenCalledWith(
    v1.scooters.ROUTES.update(scooter.id),
    expect.anything(),
    {
      method: "PATCH",
      json: { sessionId: "editor-session", variant: "Sport" },
    },
  );
});

async function openTechnical(browser: ReturnType<typeof userEvent.setup>) {
  await browser.click(screen.getByRole("button", { name: "Advanced details" }));
}
async function closeTechnical(browser: ReturnType<typeof userEvent.setup>) {
  const button = screen.getByRole("button", { name: "Advanced details" });
  if (button.getAttribute("aria-expanded") === "true")
    await browser.click(button);
}

function importStatus() {
  return screen
    .getAllByRole("status")
    .find((element) =>
      /field.*could not be interpreted/.test(element.textContent ?? ""),
    )!;
}

it("reuses stored extraction without a paid request or enabling Save on opening Edit", async () => {
  const document: v1.scooters.ScooterDocument = {
    id: "saved-civ",
    type: "civ",
    fileName: "CIV.png",
    contentType: "image/png",
    byteSize: 100,
    createdAt: scooter.createdAt,
    contentUrl: "/civ.png",
    extractedData: {
      vin: scooter.vin,
      fields: { model: scooter.model ?? null },
      rawFields: {},
    },
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterEditForm
        scooter={{ ...scooter, documents: [document] }}
        brands={brands}
        scooterHref="/en/scooters"
      />
    </NextIntlClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByText("Details extracted")).toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect(
    mocks.apiFetch.mock.calls.some(
      ([path]) => path === v1.scooters.ROUTES.documents.startExtractionJob,
    ),
  ).toBe(false);
});
