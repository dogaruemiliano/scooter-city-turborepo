import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { useState } from "react";
import { useScooterReextractionReview } from "./ScooterDocumentReextraction";
import {
  scooterEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";

const runner = vi.hoisted(() => vi.fn());
vi.mock("./scooter-document-analysis-job", () => ({
  createDocumentAnalysisAttempt: (input: unknown) => ({ input }),
  runDocumentAnalysisAttempt: runner,
  cancelDocumentAnalysisAttempt: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  webApi: {
    url: (url: string) => `http://localhost:3000${url}`,
    fetch: vi.fn(),
  },
}));
const vin = "LXYTCKP05P0000001";
const onApply = vi.fn();
const save = vi.fn();
const document = {
  id: "civ",
  type: "civ",
  fileName: "CIV.pdf",
  contentType: "application/pdf",
  byteSize: 10,
  createdAt: "2026-01-01T00:00:00.000Z",
  contentUrl: "/file",
} satisfies v1.scooters.ScooterDocument;

function Review({ editor }: { editor: ScooterDocumentsEditor }) {
  const review = useScooterReextractionReview({
    documents: editor,
    scooterId: "scooter",
    brands: [],
    rawFields: {},
    onApply,
    disabled: false,
  });
  return (
    <>
      <button type="button" onClick={review.start}>
        Reextract
      </button>
      {review.content}
    </>
  );
}
function Harness() {
  const form = useForm<ScooterEditorValues>({
    defaultValues: {
      ...scooterEditorDefaults(),
      vin,
      model: "Manual model",
      powertrainType: "combustion",
    },
  });
  const values = useWatch({ control: form.control });
  const [extractions, setExtractions] = useState({});
  const editor = {
    existing: [document],
    drafts: [],
    extractions,
    setExtractions,
    ensureSession: async () => "session",
    handleSessionError: vi.fn(),
  } as unknown as ScooterDocumentsEditor;
  return (
    <NextIntlClientProvider locale="ro" messages={messages.ro}>
      <FormProvider {...form}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Review editor={editor} />
        </form>
        <output data-testid="values">{JSON.stringify(values)}</output>
      </FormProvider>
    </NextIntlClientProvider>
  );
}
beforeEach(() => {
  runner.mockReset();
  onApply.mockReset();
  save.mockReset();
});

describe("document reextraction sheet", () => {
  it("shows a safe selection, applies proposals without submitting the scooter, and keeps the sheet surface", async () => {
    runner.mockResolvedValue({
      sourceId: "civ",
      documentType: "civ",
      extractedData: {
        vin,
        fields: { model: "AI model", civIssuedAt: "2025-01-15" },
        rawFields: {},
      },
      issues: [],
      reviewRequired: true,
    });
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reextract" }));
    const dialog = await screen.findByRole("dialog");
    const model = await within(dialog).findByRole("checkbox", {
      name: "Model",
    });
    await waitFor(() => expect(model).toBeEnabled());
    expect(model).not.toBeChecked();
    expect(
      within(dialog).queryByRole("checkbox", {
        name: messages.ro.scooters.fields.commercialName,
      }),
    ).not.toBeInTheDocument();
    const date = within(dialog).getByRole("checkbox", {
      name: messages.ro.scooters.fields.civIssuedAt,
    });
    expect(date).toBeChecked();
    expect(screen.getByTestId("values")).toHaveTextContent("Manual model");
    expect(onApply).not.toHaveBeenCalled();
    expect(dialog).not.toHaveClass("bg-background");
    expect(
      dialog.querySelector('[data-slot="bottom-sheet-body"]'),
    ).not.toHaveClass("bg-background");
    expect(
      dialog.querySelector('[data-slot="bottom-sheet-footer"]'),
    ).not.toHaveClass("bg-background");
    await user.click(
      within(dialog).getByRole("button", {
        name: /Aplică .* propuneri în formular/,
      }),
    );
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0]![0].values).toEqual({
      civIssuedAt: "2025-01-15",
    });
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.getByText(messages.ro.scooters.reextraction.applied),
    ).toBeInTheDocument();
  });
  it("discards results on close without changing the form or document evidence", async () => {
    runner.mockResolvedValue({
      sourceId: "civ",
      documentType: "civ",
      extractedData: {
        vin,
        fields: { civIssuedAt: "2025-01-15" },
        rawFields: {},
      },
      issues: [],
      reviewRequired: true,
    });
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reextract" }));
    await user.click(
      await screen.findByRole("button", { name: "Închide fără aplicare" }),
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId("values")).toHaveTextContent('"civIssuedAt":""');
  });
});
