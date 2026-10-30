import {
  mocks,
  brands,
  existing,
  scooter,
  renderWithMessages,
  pdf,
  mockBatchExtraction,
} from "./ScooterDocuments.test-helpers";
import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import {
  act,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScooterFilePreview } from "./ScooterDocumentUpload";
import { ScooterDocumentAnalysisContext } from "./ScooterDocumentAnalysisStatus";
import { useScooterDocuments } from "./useScooterDocuments";
import { ScooterCreateForm } from "./ScooterCreateForm";
import { ScooterBatchDocuments } from "./ScooterBatchDocuments";

describe("Scooter documents", () => {
  it("waits for the whole analysis batch before revealing document review actions", async () => {
    const defaultRequest = mocks.api.getMockImplementation()!;
    let finish!: () => void;
    let count = 0;
    mocks.api.mockImplementation((path, schema, options) => {
      if (path !== v1.scooters.ROUTES.documents.startExtractionJob)
        return defaultRequest(path, schema, options);
      const result = {
        sourceId: options.json.sourceId,
        documentType: "civ",
        extractedData: { vin: null, fields: {}, rawFields: {} },
        issues: [],
        reviewRequired: true,
      };
      if (++count === 1) return Promise.resolve(result);
      return new Promise<typeof result>((resolve) => {
        finish = () => resolve(result);
      });
    });
    const browser = userEvent.setup();
    renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    await browser.upload(
      screen.getByLabelText("Browse files", { selector: "input" }),
      [pdf("first.pdf"), pdf("second.pdf")],
    );
    await screen.findByText("Details extracted");
    await waitFor(() => expect(finish).toBeDefined());
    expect(
      screen.queryByRole("button", { name: "Validate the documents" }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="create-actions"]'),
    ).toHaveAttribute("data-sticky", "false");
    await act(async () => {
      finish();
    });
    const action = await screen.findByRole("button", {
      name: "Validate the documents",
    });
    expect(action).toBeEnabled();
    expect(action.closest('[data-slot="create-actions"]')).toHaveAttribute(
      "data-sticky",
      "true",
    );
  });

  it("keeps preview cards and analysis feedback visible inside the desktop drop gallery", async () => {
    function Fixture() {
      const documents = useScooterDocuments();
      return (
        <ScooterDocumentAnalysisContext
          value={{
            civ: {
              status: "success",
              analysis: {
                sourceId: "civ",
                documentType: "civ",
                extractedData: { vin: scooter.vin, fields: {}, rawFields: {} },
                issues: [],
                reviewRequired: true,
              },
            },
          }}
        >
          <ScooterBatchDocuments
            documents={{
              ...documents,
              drafts: [
                {
                  id: "civ",
                  type: "civ",
                  file: pdf("CIV.pdf"),
                  status: "ready",
                },
                {
                  id: "insurance",
                  type: "insurance",
                  file: pdf("insurance.pdf"),
                  status: "ready",
                },
              ],
              extractions: {
                civ: { vin: scooter.vin, fields: {}, rawFields: {} },
              },
            }}
            disabled={false}
            analyzing={false}
            importResult={{
              ok: true,
              values: {},
              confirmedEmpty: [],
              unresolved: [],
              unresolvedRawFields: [],
              emptyConflicts: [],
            }}
          />
        </ScooterDocumentAnalysisContext>
      );
    }
    const browser = userEvent.setup();
    renderWithMessages(<Fixture />);
    const summary = within(
      screen.getByRole("list", { name: "Attached documents" }),
    );
    const rows = summary
      .getAllByRole("listitem")
      .filter((row) =>
        row.querySelector('[data-slot="document-preview-card"]'),
      );
    expect(rows).toHaveLength(2);
    const importMore = screen.getByRole("button", {
      name: "Add document",
    });
    expect(importMore).toHaveClass(
      "w-full",
      "justify-center",
      "text-center",
      "border-dashed",
    );
    expect(
      rows[1]!.compareDocumentPosition(importMore) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    rows.forEach((row) =>
      expect(
        row.querySelector('[data-slot="document-preview-card"]'),
      ).toBeInTheDocument(),
    );
    expect(within(rows[0]!).getByText("CIV.pdf")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("CIV")).toBeInTheDocument();
    expect(within(rows[0]!).getByRole("status")).toHaveTextContent(
      messages.en.scooters.documents.batch.read,
    );
    expect(within(rows[1]!).getByText("insurance.pdf")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Insurance")).toBeInTheDocument();
    expect(within(rows[1]!).getByRole("status")).toHaveTextContent(
      messages.en.scooters.extraction.queued,
    );
    expect(
      screen.queryByRole("button", { name: /Drop your scooter documents/ }),
    ).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Add document" }));
    expect(
      screen.getByRole("list", { name: "Attached documents" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Preview / })).toHaveLength(
      2,
    );
    expect(
      screen.queryByRole("button", { name: /Drop your scooter documents/ }),
    ).not.toBeInTheDocument();
  });

  it("requires an explicit review action after manually changing a valid VIN", async () => {
    mockBatchExtraction(["civ"]);
    const browser = userEvent.setup();
    renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    await browser.upload(
      screen.getByLabelText("Browse files", { selector: "input" }),
      pdf(),
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "VIN" })).toHaveValue(
        scooter.vin,
      ),
    );
    const enteredVin = "LXYTCZP05P0000001";
    fireEvent.change(screen.getByRole("textbox", { name: "VIN" }), {
      target: { value: enteredVin },
    });
    const action = await screen.findByRole("button", {
      name: "Validate the documents",
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(/VIN differs between the scooter/),
    ).toHaveTextContent("CIV.pdf");
    expect(action.closest('[data-slot="create-actions"]')).toHaveAttribute(
      "data-sticky",
      "true",
    );
    await browser.click(action);
    const t = messages.en.scooters.extraction.vinReview;
    expect(
      await screen.findByRole("dialog", { name: t.documentsTitle }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: t.title }),
    ).not.toBeInTheDocument();
    await browser.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("textbox", { name: "VIN" })).toHaveValue(
      enteredVin,
    );
  });

  it.each(["unreadable", "failed"])(
    "opens the existing VIN and document sheets from the validation action after %s analysis",
    async (status) => {
      const defaultRequest = mocks.api.getMockImplementation()!;
      mocks.api.mockImplementation(async (path, schema, options) => {
        if (path !== v1.scooters.ROUTES.documents.startExtractionJob)
          return defaultRequest(path, schema, options);
        if (status === "failed")
          throw new ApiError(
            503,
            "Analysis unavailable",
            "DOCUMENT_EXTRACTION_UNAVAILABLE",
          );
        return {
          sourceId: options.json.sourceId,
          documentType: "civ",
          extractedData: {
            vin: null,
            fields: { color: "White" },
            rawFields: {},
          },
          issues: [{ field: "vin", code: "unreadable" }],
          reviewRequired: true,
        };
      });
      const browser = userEvent.setup();
      renderWithMessages(
        <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
      );
      await browser.upload(
        screen.getByLabelText("Browse files", { selector: "input" }),
        pdf(),
      );
      if (status === "failed") {
        await browser.click(
          await screen.findByRole("button", {
            name: "Edit document type for CIV.pdf",
          }),
        );
        await browser.click(
          await screen.findByRole("combobox", {
            name: "Document type for CIV.pdf",
          }),
        );
        await browser.click(
          await screen.findByRole("option", {
            name: messages.en.scooters.documents.civ,
          }),
        );
      }
      if (status === "unreadable")
        await screen.findByText(/The document VIN could not be verified/);
      const action = await screen.findByRole("button", {
        name: "Validate the documents",
      });
      await waitFor(() => expect(action).toBeEnabled());
      const t = messages.en.scooters.extraction.vinReview;
      expect(
        screen.queryByRole("dialog", { name: t.title }),
      ).not.toBeInTheDocument();
      await browser.click(action);
      const identity = await screen.findByRole("dialog", { name: t.title });
      expect(identity).toHaveClass("bg-popover");
      expect(identity.querySelector(".bg-background")).toBeNull();
      fireEvent.change(
        within(identity).getByRole("textbox", { name: t.vinLabel }),
        {
          target: { value: scooter.vin },
        },
      );
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
      await browser.click(
        within(identity).getByRole("button", { name: t.continue }),
      );
      const review = await screen.findByRole("dialog", {
        name: t.documentsTitle,
      });
      expect(review).toHaveClass("bg-popover");
      expect(review.querySelector(".bg-background")).toBeNull();
      expect(
        within(review).getByRole("region", { name: "Preview CIV.pdf" }),
      ).toBeInTheDocument();
      expect(within(review).queryByRole("checkbox")).not.toBeInTheDocument();
      expect(within(review).getByRole("button", { name: /3s/ })).toBeDisabled();
      act(() => vi.advanceTimersByTime(3000));
      await browser.click(
        within(review).getByRole("button", { name: t.confirmAndFinish }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(
        screen.queryByRole("button", { name: "Validate the documents" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Create scooter" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "VIN" })).toHaveValue(
        scooter.vin,
      );
      expect(
        mocks.api.mock.calls.filter(
          ([path]) => path === v1.scooters.ROUTES.create,
        ),
      ).toHaveLength(0);
    },
  );

  it("uses the shared preview corner indicator during extraction without adding status text below it", () => {
    renderWithMessages(
      <ScooterDocumentAnalysisContext value={{ doc: { status: "processing" } }}>
        <ScooterFilePreview document={existing} disabled={false} />
      </ScooterDocumentAnalysisContext>,
    );
    const preview = screen.getByRole("button", { name: "Preview old.pdf" });
    expect(preview).toHaveAttribute("aria-busy", "true");
    expect(within(preview).getByText("Extracting…")).toHaveClass("sr-only");
    expect(screen.getAllByText("Extracting…")).toHaveLength(1);
    expect(screen.queryByText(/Extracted/)).not.toBeInTheDocument();
  });
});
