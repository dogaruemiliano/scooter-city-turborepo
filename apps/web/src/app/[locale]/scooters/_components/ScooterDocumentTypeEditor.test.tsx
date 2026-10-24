import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ScooterDocumentTypeEditor } from "./ScooterDocumentTypeEditor";

function mount(
  props: Partial<Parameters<typeof ScooterDocumentTypeEditor>[0]> = {},
) {
  const onType = vi.fn();
  const onDocument = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterDocumentTypeEditor
        sourceId="file"
        fileName="scan.pdf"
        type="civ"
        disabled={false}
        onType={onType}
        onDocument={onDocument}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onType, onDocument };
}
const document: v1.scooters.LogicalDocumentExtraction = {
  id: "one",
  documentType: "civ",
  pages: [1],
  vin: "LXYTCKP05P0000001",
  fields: {},
  rawFields: {},
};

describe("document card type editor", () => {
  it("keeps the type selector behind a small edit action", async () => {
    const user = userEvent.setup();
    const { onType } = mount();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Edit document type for scan.pdf" }),
    );
    await user.click(
      screen.getByRole("combobox", { name: "Document type for scan.pdf" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Purchase / ownership proof" }),
    );
    expect(onType).toHaveBeenCalledWith("ownership_proof");
  });
  it("edits the correct logical document in a mixed PDF without reclassifying the upload", async () => {
    const user = userEvent.setup();
    const { onType, onDocument } = mount({
      documents: [
        document,
        {
          ...document,
          id: "two",
          documentType: "export_certificate",
          pages: [2],
        },
      ],
    });
    await user.click(
      screen.getByRole("button", { name: "Edit document type for scan.pdf" }),
    );
    await user.click(
      screen.getByRole("combobox", {
        name: "Document type for scan.pdf · Pages 2",
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Purchase / ownership proof" }),
    );
    expect(onDocument).toHaveBeenCalledWith("file", "two", {
      documentType: "ownership_proof",
    });
    expect(onType).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("preserves explicit VIN-conflict resolution beside the file", async () => {
    const user = userEvent.setup();
    const { onDocument } = mount({
      documents: [document],
      scooterVin: "LXYTCKP05P0000002",
    });
    await user.click(
      screen.getByRole("button", { name: "Edit document type for scan.pdf" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(document.vin!);
    await user.click(
      screen.getByRole("button", {
        name: "Confirm this document belongs to the scooter VIN",
      }),
    );
    expect(onDocument).toHaveBeenCalledWith("file", "one", {
      vin: "LXYTCKP05P0000002",
    });
  });
  it("disables edits while the file cannot be changed", () => {
    mount({ disabled: true });
    expect(
      screen.getByRole("button", { name: "Edit document type for scan.pdf" }),
    ).toBeDisabled();
  });
});
