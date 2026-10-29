import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScooterEditor } from "./ScooterEditor";
vi.mock("./ScooterPhotos", () => ({ ScooterPhotos: () => null }));
import type { DocumentDraft } from "./useScooterDocuments";
import { scooterEditorDefaults } from "./scooter-editor-schema";
import type { ScooterImportSnapshot } from "./scooter-import-workspace";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: async (path: string, ...args: unknown[]) => {
      if (path === v1.scooters.ROUTES.nextFleetNumber)
        return { fleetNumber: 7 };
      return apiFetch(path, ...args);
    },
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const files: DocumentDraft[] = [
  {
    id: "civ",
    type: "civ",
    file: new File(["synthetic"], "civ.pdf", { type: "application/pdf" }),
    status: "ready",
    uploadToken: "civ",
  },
  {
    id: "registration",
    type: "registration_certificate",
    file: new File(["synthetic"], "registration.pdf", {
      type: "application/pdf",
    }),
    status: "ready",
    uploadToken: "registration",
  },
];
let persisted: Record<string, v1.scooters.ScooterDocumentExtractedData | null> =
  {};
vi.mock("./useScooterDocuments", () => ({
  useScooterDocuments: () => {
    const [extractions, setExtractions] = useState({});
    persisted = extractions;
    return {
      drafts: files,
      ensureSession: async () => "session",
      handleSessionError: vi.fn(),
      beginSave: vi.fn(),
      saved: vi.fn(),
      saveFailed: vi.fn(),
      discardSession: vi.fn(),
      existing: [],
      removed: [],
      removedIds: [],
      extractions,
      setExtractions,
      blocked: false,
      changed: true,
      payload: {},
      add: vi.fn(),
      retry: vi.fn(),
      removeDraft: vi.fn(),
      removeExisting: vi.fn(),
      undoRemove: vi.fn(),
    };
  },
}));

beforeEach(() => {
  apiFetch.mockReset();
});
afterEach(() => vi.useRealTimers());

it.each(["en", "ro"] as const)(
  "unblocks an already-reviewed draft with a conflicting section VIN in %s",
  async (locale) => {
    const correct = "LXYTCZP05P0000001";
    const misread = "LXYTC2P05P0000001";
    const t = messages[locale].scooters;
    const brand = {
      id: "brand-1",
      name: "Honda",
      code: "HON",
      scooterCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const result: v1.scooters.ScooterDocumentAnalysis = {
      sourceId: "civ",
      documentType: "civ",
      reviewRequired: true,
      issues: [],
      extractedData: {
        vin: correct,
        fields: { vin: correct },
        rawFields: {},
        vinReview: { method: "manual", originalVin: misread },
        documents: [
          {
            id: "identity",
            documentType: "civ",
            pages: [1],
            vin: correct,
            fields: { vin: correct },
            rawFields: {},
          },
          {
            id: "foreign",
            documentType: "foreign_registration",
            pages: [2, 3],
            vin: misread,
            fields: { vin: misread },
            rawFields: { E: misread },
          },
        ],
      },
    };
    const registration = {
      ...result,
      sourceId: "registration",
      documentType: "registration_certificate" as const,
      extractedData: { vin: null, fields: {}, rawFields: {} },
    };
    const state: ScooterImportSnapshot = {
      version: 1,
      values: {
        ...scooterEditorDefaults(),
        vin: correct,
        brandId: brand.id,
        fleetNumber: "7",
        registrationType: "unregistered",
      },
      documents: { drafts: [], removedIds: [], extractions: {} },
      analysis: {
        entries: {
          civ: { status: "success", analysis: result },
          registration: { status: "success", analysis: registration },
        },
        cache: files.map((file) => [
          JSON.stringify([
            file.id,
            file.type,
            file.file.name,
            file.file.size,
            file.file.lastModified,
          ]),
          file.id,
        ]),
        attempts: [],
      },
      extraction: {
        confirmedSources: [],
        origins: [],
        manual: [],
        automaticBaselines: [],
        rawBySource: [],
      },
      importedRawFields: null,
      importedSignature: null,
      automaticImport: "",
      reviewedDocuments: [],
      createdBrands: [],
      status: "attention",
    };
    const onCreated = vi.fn();
    render(
      <NextIntlClientProvider locale={locale} messages={messages[locale]}>
        <ScooterEditor
          brands={[brand]}
          returnHref={`/${locale}/scooters`}
          initialSnapshot={state}
          onCreated={onCreated}
        />
      </NextIntlClientProvider>,
    );
    const alert = await screen.findByText(t.extraction.vinReview.conflictTitle);
    const warning = alert.closest('[role="alert"]') as HTMLElement;
    expect(within(warning).getByText("civ.pdf")).toBeInTheDocument();
    expect(
      within(warning).getByText(t.documents.foreign_registration, {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      within(warning).getByText(t.workspace.pages.replace("{pages}", "2, 3"), {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(within(warning).getByText(misread)).toBeInTheDocument();
    expect(within(warning).getByText(correct)).toBeInTheDocument();
    expect(screen.queryByText(t.creation.ready)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t.actions.create }),
    ).not.toBeInTheDocument();
    const review = screen.getByRole("button", {
      name: t.creation.validateDocuments,
    });
    expect(review).toBeEnabled();
    fireEvent.submit(review.closest("form")!);
    await act(async () => {});
    expect(apiFetch).not.toHaveBeenCalled();
    fireEvent.click(review);
    let sheet = await screen.findByRole("dialog", {
      name: t.extraction.vinReview.documentsTitle,
    });
    expect(within(sheet).getByText(misread)).toBeInTheDocument();
    fireEvent.click(
      within(sheet).getByRole("button", { name: t.extraction.vinReview.later }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: t.extraction.vinReview.documentsTitle,
        }),
      ).not.toBeInTheDocument(),
    );
    expect(review).toBeEnabled();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    fireEvent.click(review);
    // Preview hydration yields before the sheet opens.
    await act(async () => {});
    sheet = screen.getByRole("dialog", {
      name: t.extraction.vinReview.documentsTitle,
    });
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.click(
      within(sheet).getByRole("button", {
        name: t.extraction.vinReview.confirmAndFinish,
      }),
    );
    vi.useRealTimers();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: t.creation.validateDocuments }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: t.actions.create }),
    ).toBeEnabled();
    expect(
      screen.queryByText(t.extraction.vinReview.conflictTitle),
    ).not.toBeInTheDocument();
    expect(persisted.civ?.documents?.[1]).toMatchObject({
      vin: correct,
      rawFields: { E: misread },
      vinReview: { method: "manual", originalVin: misread },
    });
    expect(apiFetch).not.toHaveBeenCalled();
    apiFetch.mockResolvedValue({ id: "created-scooter" });
    fireEvent.click(screen.getByRole("button", { name: t.actions.create }));
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({ id: "created-scooter" }, false),
    );
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith(
      v1.scooters.ROUTES.create,
      v1.scooters.scooterSchema,
      expect.objectContaining({
        method: "POST",
        json: expect.objectContaining({ vin: correct }),
      }),
    );
  },
);

it.each(["civ", "registration"] as const)(
  "fills the CIV VIN and ignores a legacy Romanian registration VIN when %s completes first",
  async (firstSource) => {
    const correct = "LXYTCZP05P0000001";
    const misread = "LXYTC2P05P0000001";
    const completions = new Map<string, () => void>();
    apiFetch.mockImplementation((_route, _schema, options) => {
      if (!options?.json) throw new Error(`Unexpected API request: ${_route}`);
      const { json } = options;
      const vin = json.sourceId === "civ" ? correct : misread;
      const result: v1.scooters.ScooterDocumentAnalysis = {
        sourceId: json.sourceId,
        documentType: json.source.type,
        extractedData: {
          vin,
          fields: { vin },
          rawFields: { E: vin },
          ...(json.sourceId === "civ"
            ? {
                documents: [
                  {
                    id: "civ-child",
                    documentType: "civ",
                    pages: [1],
                    vin,
                    fields: { vin },
                    rawFields: {},
                  },
                ],
              }
            : {}),
        },
        issues: [],
        reviewRequired: true,
      };
      return new Promise<v1.scooters.ScooterDocumentExtractionJob>(
        (resolve) => {
          completions.set(json.sourceId, () =>
            resolve({
              id: `job-${json.sourceId}`,
              sourceId: json.sourceId,
              documentType: json.source.type,
              status: "completed",
              result,
              expiresAt: new Date(Date.now() + 300_000).toISOString(),
            }),
          );
        },
      );
    });
    // Await React's effect chain instead of giving the full editor a one-second
    // waitFor deadline. CI can render this form much more slowly than a laptop.
    await act(async () => {
      render(
        <NextIntlClientProvider locale="en" messages={messages.en}>
          <ScooterEditor brands={[]} returnHref="/en/scooters" />
        </NextIntlClientProvider>,
      );
    });
    expect([...completions.keys()].sort()).toEqual(["civ", "registration"]);
    expect(screen.getByLabelText("VIN")).toHaveValue("");
    expect(
      screen.queryByRole("dialog", { name: "Verify the scooter VIN" }),
    ).not.toBeInTheDocument();
    // Keep the requests pending until explicitly completed, and exercise both
    // response orders so a late registration response cannot overwrite the CIV.
    const secondSource = firstSource === "civ" ? "registration" : "civ";
    await act(async () => {
      completions.get(firstSource)!();
    });
    expect(screen.getByLabelText("VIN")).toHaveValue(
      firstSource === "civ" ? correct : "",
    );
    await act(async () => {
      completions.get(secondSource)!();
    });
    expect(screen.getByLabelText("VIN")).toHaveValue(correct);
    expect(
      screen.queryByRole("button", {
        name: messages.en.scooters.creation.validateDocuments,
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(persisted.registration?.vin).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("region", { name: "Review identified documents" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("I reviewed this document and its pages."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create scooter" }),
    ).toBeEnabled();
  },
);

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: { isSuperAdmin: true } }),
}));
