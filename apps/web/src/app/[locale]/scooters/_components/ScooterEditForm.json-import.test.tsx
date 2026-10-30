import {
  mocks,
  scooter,
  brands,
  openJsonImport,
  renderEditForm,
  openTechnical,
  closeTechnical,
  importStatus,
} from "./ScooterEditForm.test-helpers";
import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ScooterEditForm } from "./ScooterEditForm";

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
            expectedUpdatedAt: scooter.updatedAt,
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
});
