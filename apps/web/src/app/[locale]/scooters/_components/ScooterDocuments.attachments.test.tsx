import {
  mocks,
  brands,
  existing,
  scooter,
  renderWithMessages,
  Harness,
  pdf,
  mockBatchExtraction,
} from "./ScooterDocuments.test-helpers";
import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ScooterCreateForm } from "./ScooterCreateForm";

describe("Scooter documents", () => {
  it("rejects invalid files and duplicates while accepting valid files from the same drop", async () => {
    mockBatchExtraction(["civ"]);
    renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    const valid = pdf("scan.pdf");
    const invalid = new File(["text"], "notes.txt", { type: "text/plain" });
    fireEvent.drop(
      screen.getByRole("button", { name: /Drop your scooter documents/ }),
      { dataTransfer: { files: [valid, invalid, valid] } },
    );
    expect(
      screen.getByText(/notes.txt: Unsupported format/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/scan.pdf: This file is already attached/),
    ).toBeInTheDocument();
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
  });

  it("offers one multi-file input and leaves missing categories optional", () => {
    const { container } = renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    expect(
      container.querySelectorAll('input[type="file"][multiple]'),
    ).toHaveLength(1);
    expect(screen.getByLabelText("VIN")).toBeInTheDocument();
    expect(screen.getByLabelText("Insured name")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Create scooter" }),
    ).toBeEnabled();
  });

  it("uses one import preview with a plus for multiple attachments and removes them individually", async () => {
    const browser = userEvent.setup();
    renderWithMessages(<Harness initial={[]} type="import_document" />);
    await browser.upload(
      screen.getByLabelText("Add Import documents", { selector: "input" }),
      [pdf("import-front.pdf"), pdf("import-back.pdf")],
    );
    expect(mocks.api).not.toHaveBeenCalled();
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("2 documents")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add Import documents" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add another document" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Preview / })).toHaveLength(
      1,
    );
    await browser.click(
      screen.getByRole("button", { name: "Preview import-front.pdf" }),
    );
    expect(
      screen.getByText(
        messages.en.scooters.documents.documentPosition
          .replace("{index}", "1")
          .replace("{total}", "2"),
      ),
    ).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Next document" }));
    expect(
      screen.getByRole("dialog", { name: "import-back.pdf" }),
    ).toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Document actions" }),
    );
    await browser.click(
      await screen.findByRole("menuitem", { name: "Remove" }),
    );
    expect(
      screen.getByRole("dialog", { name: "import-front.pdf" }),
    ).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.getByText("1 document")).toBeInTheDocument();
  });

  it("keeps multiple insurance pages attached to one optional policy", async () => {
    mockBatchExtraction(["insurance", "insurance"]);
    const browser = userEvent.setup();
    renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    await browser.upload(
      screen.getByLabelText("Browse files", { selector: "input" }),
      [pdf("front.pdf"), pdf("back.pdf")],
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Insured name")).toHaveValue(
        "Example Person",
      ),
    );
    await waitFor(() =>
      expect(screen.getAllByText("Details extracted")).toHaveLength(2),
    );
    expect(screen.getAllByLabelText("Insured name")).toHaveLength(1);
    await browser.click(
      screen.getByRole("button", { name: "Remove front.pdf" }),
    );
    expect(screen.getByLabelText("Insured name")).toHaveValue("Example Person");
    await browser.click(
      screen.getByRole("button", { name: "Remove back.pdf" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Insured name")).toHaveValue(""),
    );
  });

  it("allows a partial batch and adds another document without re-extracting the first", async () => {
    mockBatchExtraction(["civ", "registration_certificate"]);
    const browser = userEvent.setup();
    renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    await browser.upload(
      screen.getByLabelText("Browse files", { selector: "input" }),
      pdf("first.pdf"),
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "VIN" })).toHaveValue(
        scooter.vin,
      ),
    );
    fireEvent.change(screen.getByLabelText("Color"), {
      target: { value: "Blue" },
    });
    await browser.upload(
      screen.getByLabelText("Browse files", { selector: "input" }),
      pdf("second.pdf"),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Plate number")).toHaveValue("14949"),
    );
    expect(screen.getByLabelText("Color")).toHaveValue("Blue");
    expect(
      mocks.api.mock.calls.filter(
        ([path]) => path === v1.scooters.ROUTES.documents.startExtractionJob,
      ),
    ).toHaveLength(2);
    expect(screen.getByLabelText("Insured name")).toHaveValue("");
  });

  it("can undo removing one saved attachment while other attachments remain", async () => {
    const browser = userEvent.setup();
    renderWithMessages(
      <Harness
        initial={[
          existing,
          { ...existing, id: "second", fileName: "second.pdf" },
        ]}
      />,
    );
    await browser.click(
      screen.getByRole("button", { name: "Preview old.pdf" }),
    );
    await browser.click(screen.getByRole("button", { name: "Next document" }));
    await browser.click(
      screen.getByRole("button", { name: "Document actions" }),
    );
    await browser.click(
      await screen.findByRole("menuitem", { name: "Remove" }),
    );
    await browser.click(screen.getByRole("button", { name: "Close preview" }));
    expect(
      screen.getByRole("button", { name: "Preview old.pdf" }),
    ).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Undo removal" }));
    expect(screen.getByText("2 documents")).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("applies the scooter-wide attachment limit to a native multi-file selection", async () => {
    renderWithMessages(
      <Harness
        type="import_document"
        initial={Array.from({ length: 19 }, (_, index) => ({
          ...existing,
          id: `existing-${index}`,
        }))}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Add Import documents", { selector: "input" }),
      {
        target: { files: [pdf("first.pdf"), pdf("second.pdf")] },
      },
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can attach up to 20 files per scooter.",
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("can replace a saved attachment when the scooter-wide attachment limit is reached", async () => {
    const browser = userEvent.setup();
    renderWithMessages(
      <Harness
        initial={Array.from({ length: 20 }, (_, index) => ({
          ...existing,
          id: `existing-${index}`,
          fileName: `old-${index}.pdf`,
        }))}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Add another document" }),
    ).toBeDisabled();
    await browser.click(
      screen.getByRole("button", { name: "Preview old-0.pdf" }),
    );
    await browser.click(
      screen.getByRole("button", { name: "Document actions" }),
    );
    await browser.click(
      await screen.findByRole("menuitem", { name: "Change document" }),
    );
    await browser.upload(
      screen.getByLabelText("Change document", { selector: "input" }),
      pdf("replacement.pdf"),
    );
    expect(mocks.api).not.toHaveBeenCalled();
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(screen.getByText("20 documents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo removal" })).toBeDisabled();
  });
});
