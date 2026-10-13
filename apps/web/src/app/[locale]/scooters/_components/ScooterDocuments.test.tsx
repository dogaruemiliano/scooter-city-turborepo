import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import {
  act,
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ScooterDocumentUpload,
  ScooterFilePreview,
} from "./ScooterDocumentUpload";
import { ScooterDocumentAnalysisContext } from "./ScooterDocumentAnalysisStatus";
import { useScooterDocuments } from "./useScooterDocuments";
import { ScooterCreateForm } from "./ScooterCreateForm";
import { ScooterEditForm } from "./ScooterEditForm";
import { ScooterBatchDocuments } from "./ScooterBatchDocuments";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  put: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  webApi: {
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
      const result = await mocks.api(path, ...args);
      return path === v1.scooters.ROUTES.documents.startExtractionJob &&
        result?.extractedData
        ? {
            id: `job-${result.sourceId}`,
            sourceId: result.sourceId,
            documentType: (args[1] as { json: { source: { type: string } } })
              .json.source.type,
            status: "completed",
            result,
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          }
        : result;
    },
    url: (path: string) => `https://api.example.com${path}`,
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
const brands = [
  {
    id: "brand",
    name: "Yamaha",
    code: "YAM",
    scooterCount: 0,
    createdAt: "",
    updatedAt: "",
  },
];
const existing: v1.scooters.ScooterDocument = {
  id: "doc",
  type: "civ",
  fileName: "old.pdf",
  contentType: "application/pdf",
  byteSize: 50,
  createdAt: "",
  contentUrl: "/v1/scooters/s/documents/doc/content",
};
const scooter: v1.scooters.Scooter = {
  id: "s",
  vin: "LXYTCKP05P0000001",
  brandId: "brand",
  brand: "Yamaha",
  fleetNumber: 1,
  brandCode: "YAM",
  model: null,
  color: null,
  manufactureYear: null,
  engineCode: null,
  engineDisplacementCc: null,
  powerKw: null,
  powertrainType: "combustion",
  registrationType: "unregistered",
  registrationNumber: null,
  registrationDate: null,
  temporaryRegistrationExpiresAt: null,
  requiredLicenseCategory: "none",
  currentMileageKm: null,
  hasGps: null,
  odometerWorking: null,
  speedometerWorking: null,
  actualMaxSpeedKmh: null,
  notes: null,
  createdAt: "",
  updatedAt: "",
  deletedAt: null,
  documents: [existing],
};
function renderWithMessages(
  child: React.ReactNode,
  locale: "en" | "ro" = "en",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {child}
    </NextIntlClientProvider>,
  );
}
function Harness({
  initial = [existing],
  type = "civ",
}: {
  initial?: v1.scooters.ScooterDocument[];
  type?: v1.scooters.ScooterDocumentType;
}) {
  const documents = useScooterDocuments(initial);
  return (
    <>
      <ScooterDocumentUpload
        type={type}
        documents={documents}
        disabled={false}
      />
      <button disabled={documents.blocked}>Save test</button>
    </>
  );
}
function pdf(name = "CIV.pdf") {
  const file = new File(["%PDF"], name, { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new ArrayBuffer(4),
  });
  return file;
}
beforeEach(() => {
  access.user = { isSuperAdmin: true, effectiveScopes: {} };
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.put);
  let nextId = 0;
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(
      () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
    ),
    subtle: { digest: vi.fn(async () => new ArrayBuffer(32)) },
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  mocks.api.mockImplementation(async (path: string) =>
    path === v1.scooters.ROUTES.documents.createDraftUpload
      ? {
          uploadUrl: "https://s3.example.com/upload",
          uploadToken: "token",
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          expiresAt: "",
          maxBytes: 15_728_640,
        }
      : scooter,
  );
  mocks.put.mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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
  it("keeps a compact attached-document list with upload and analysis badges", async () => {
    function Fixture() {
      const documents = useScooterDocuments();
      return (
        <ScooterBatchDocuments
          documents={{
            ...documents,
            drafts: [
              { id: "civ", type: "civ", file: pdf("CIV.pdf"), status: "ready" },
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
      );
    }
    const browser = userEvent.setup();
    renderWithMessages(<Fixture />);
    const summary = within(
      screen.getByRole("list", { name: "Attached documents" }),
    );
    const rows = summary.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(
      within(rows[2]!).getByRole("button", { name: "Import more documents" }),
    ).toHaveClass("w-full", "justify-center", "text-center", "border-dashed");
    expect(within(rows[0]!).getByText("CIV.pdf")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("CIV")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Uploaded and analyzed")).toHaveClass(
      "text-success",
    );
    expect(within(rows[1]!).getByText("insurance.pdf")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Insurance")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Uploaded")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Drop your scooter documents/ }),
    ).not.toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Import more documents" }),
    );
    expect(
      screen.queryByRole("list", { name: "Attached documents" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Drop your scooter documents/ }),
    ).toBeInTheDocument();
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
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

  it("shows the actual server size limit in Romanian in a standalone preview", () => {
    renderWithMessages(
      <ScooterFilePreview
        draft={{
          id: "failed-upload",
          type: "civ",
          file: pdf(),
          status: "failed",
          uploadError: "uploadLimit",
          uploadMaxBytes: 10 * 1024 * 1024,
        }}
        disabled={false}
        onReplace={() => undefined}
        validate={() => null}
      />,
      "ro",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Serverul acceptă fișiere de maximum 10 MB.",
    );
    expect(screen.queryByText("Încărcarea a eșuat")).not.toBeInTheDocument();
  });

  it("uploads a file above the old 10 MB limit and allows saving", async () => {
    const browser = userEvent.setup();
    renderWithMessages(<Harness initial={[]} />);
    const file = pdf();
    Object.defineProperty(file, "size", { value: 12 * 1024 * 1024 });
    await browser.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      file,
    );
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save test" })).toBeEnabled(),
    );
    expect(mocks.api).toHaveBeenCalledWith(
      v1.scooters.ROUTES.documents.createDraftUpload,
      v1.scooters.scooterDocumentUploadSchema,
      expect.objectContaining({
        json: expect.objectContaining({ byteSize: 12 * 1024 * 1024 }),
      }),
    );
    expect(mocks.put).toHaveBeenCalledWith(
      "https://s3.example.com/upload",
      expect.objectContaining({ method: "PUT", body: file }),
    );
  });

  it.each([
    [
      new ApiError(413, "too large", "FILE_TOO_LARGE", {
        maxBytes: 10 * 1024 * 1024,
      }),
      "The server accepts files up to 10 MB.",
    ],
    [
      new ApiError(413, "too large"),
      "The server rejected this file because it exceeds its upload limit.",
    ],
    [
      new ApiError(503, "private storage details", "IMAGE_STORAGE_UNAVAILABLE"),
      "File storage is temporarily unavailable.",
    ],
    [new TypeError("Failed to fetch"), "The upload connection failed."],
  ])(
    "shows actionable upload errors instead of the generic failure: %s",
    async (error, message) => {
      mocks.api.mockRejectedValueOnce(error);
      const browser = userEvent.setup();
      renderWithMessages(<Harness initial={[]} />);
      await browser.upload(
        screen.getByLabelText("Add Vehicle identity card (CIV)", {
          selector: "input",
        }),
        pdf(),
      );
      await browser.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Save",
        }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByRole("button", { name: "Save test" })).toBeDisabled();
      expect(mocks.put).not.toHaveBeenCalled();
    },
  );

  it("checks the server's returned upload limit before sending file bytes to S3", async () => {
    mocks.api.mockResolvedValueOnce({
      uploadUrl: "https://s3.example.com/upload",
      uploadToken: "token",
      method: "PUT",
      headers: {},
      maxBytes: 10 * 1024 * 1024,
    });
    const browser = userEvent.setup();
    renderWithMessages(<Harness initial={[]} />);
    const file = pdf();
    Object.defineProperty(file, "size", { value: 12 * 1024 * 1024 });
    await browser.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      file,
    );
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The server accepts files up to 10 MB.",
    );
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it.each([
    ["queued", "Waiting to analyze…"],
    ["validating", "Preparing document…"],
    ["running", "Analyzing document…"],
  ] as const)("announces %s in the grouped upload preview", (phase, label) => {
    renderWithMessages(
      <ScooterDocumentAnalysisContext
        value={{ doc: { status: "processing", phase } }}
      >
        <Harness />
      </ScooterDocumentAnalysisContext>,
    );
    expect(
      within(screen.getByRole("button", { name: "Preview old.pdf" })).getByText(
        label,
      ),
    ).toHaveClass("sr-only");
  });
  it("shows restart guidance for closed sessions without an upload retry loop", async () => {
    mocks.api.mockRejectedValueOnce(
      new ApiError(400, "closed", "DOCUMENT_EDITOR_SESSION_UNAVAILABLE"),
    );
    const browser = userEvent.setup();
    renderWithMessages(<Harness initial={[]} />);
    await browser.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      pdf(),
    );
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.en.scooters.documents.sessionExpired,
    );
    expect(
      screen.queryByRole("button", { name: "Retry upload" }),
    ).not.toBeInTheDocument();
    expect(mocks.put).not.toHaveBeenCalled();
  });
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
  it("drops all four types together, fills one review form, and saves them in one action", async () => {
    const types = [
      "import_document",
      "civ",
      "registration_certificate",
      "insurance",
    ] as const;
    mockBatchExtraction(types);
    const browser = userEvent.setup();
    renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    const vinInput = screen.getByRole("textbox", { name: "VIN" });
    fireEvent.drop(
      screen.getByRole("button", { name: /Drop your scooter documents/ }),
      {
        dataTransfer: {
          files: types.map((_, index) => pdf(`scan-${index}.pdf`)),
        },
      },
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Upload, classification, and form import span several renders. Poll the
    // existing input instead of recalculating every textbox's accessible name.
    await waitFor(() => expect(vinInput).toHaveValue(scooter.vin), {
      timeout: 5_000,
    });
    await waitFor(
      () =>
        expect(screen.getByLabelText("Total premium")).toHaveValue("278.88"),
      { timeout: 5_000 },
    );
    expect(screen.getByLabelText("Plate number")).toHaveValue("14949");
    expect(screen.getByLabelText("Insured name")).toHaveValue("Example Person");
    await browser.click(
      screen.getByRole("button", { name: "Import more documents" }),
    );
    for (const [index, type] of types.entries())
      expect(
        screen.getByRole("combobox", {
          name: `Document type for scan-${index}.pdf`,
        }),
      ).toHaveTextContent(messages.en.scooters.documents[type]);
    expect(
      screen.queryByRole("button", { name: "Continue" }),
    ).not.toBeInTheDocument();
    expect(
      mocks.api.mock.calls.filter(
        ([path]) => path === v1.scooters.ROUTES.create,
      ),
    ).toHaveLength(0);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create scooter" }),
      ).toBeEnabled(),
    );
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await browser.click(await screen.findByRole("button", { name: "Finish" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/scooters"));
    const payload = mocks.api.mock.calls.find(
      ([path]) => path === v1.scooters.ROUTES.create,
    )![2].json;
    expect(payload.documentDrafts).toHaveLength(4);
    expect(
      payload.documentDrafts.map((doc: { type: string }) => doc.type),
    ).toEqual(types);
    expect(
      payload.documentDrafts.every(
        (doc: { uploadType: string; extractedData: unknown }) =>
          doc.uploadType === "unclassified" && doc.extractedData,
      ),
    ).toBe(true);
    expect(payload.insurancePolicies[0]).toMatchObject({
      insuredName: "Example Person",
      premiumAmount: 278.88,
    });
    expect(
      mocks.api.mock.calls.filter(
        ([path]) => path === v1.scooters.ROUTES.documents.startExtractionJob,
      ),
    ).toHaveLength(4);
  }, 15_000);

  it("requires explicit verification when direct AI cannot read a VIN", async () => {
    const defaultRequest = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (path, schema, options) => {
      if (path !== v1.scooters.ROUTES.documents.startExtractionJob)
        return defaultRequest(path, schema, options);
      return {
        sourceId: options.json.sourceId,
        documentType: "civ",
        extractedData: { vin: null, fields: { color: "White" }, rawFields: {} },
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
    const action = await screen.findByRole("button", {
      name: "Validate the documents",
    });
    expect(
      screen.queryByRole("checkbox", { name: "I checked CIV.pdf" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "VIN" }), {
      target: { value: scooter.vin },
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    await browser.click(action);
    const t = messages.en.scooters.extraction.vinReview;
    const review = await screen.findByRole("dialog", {
      name: t.documentsTitle,
    });
    expect(
      screen.queryByRole("dialog", { name: t.title }),
    ).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    await browser.click(
      within(review).getByRole("button", { name: t.confirmAndFinish }),
    );
    expect(screen.getByRole("textbox", { name: "VIN" })).toHaveValue(
      scooter.vin,
    );
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    expect(
      mocks.api.mock.calls.filter(
        ([path]) => path === v1.scooters.ROUTES.documents.startExtractionJob,
      ),
    ).toHaveLength(1);
  });

  it("imports a downloaded JSON file after uploading all three documents and submits their evidence", async () => {
    let nextId = 0;
    vi.mocked(crypto.randomUUID).mockImplementation(
      () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
    );
    const browser = userEvent.setup();
    access.user = {
      isSuperAdmin: false,
      effectiveScopes: {
        "scooter_documents.read": ["ALL"],
        "scooter_documents.write": ["ALL"],
      },
    };
    renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    const documents = [
      {
        type: "civ",
        label: "Vehicle identity card (CIV)",
        fileName: "CIV-004-AGM.pdf",
      },
      {
        type: "registration_certificate",
        label: "Registration certificate",
        fileName: "cert-inreg-004-AGM.pdf",
      },
      {
        type: "insurance",
        label: "Insurance policy",
        fileName: "asigurare-004-AGM.pdf",
      },
    ];
    await browser.upload(
      screen.getByLabelText("Browse files", { selector: "input" }),
      documents.map((document) => pdf(document.fileName)),
    );
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(3));
    for (const document of documents) {
      const expand = screen.queryByRole("button", {
        name: "Import more documents",
      });
      if (expand) await browser.click(expand);
      await browser.click(
        screen.getByRole("combobox", {
          name: `Document type for ${document.fileName}`,
        }),
      );
      await browser.click(
        await screen.findByRole("option", { name: document.label }),
      );
    }
    const vin = "L5YAUCZB9H1148984";
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    {
      const expand = screen.queryByRole("button", {
        name: "Import more documents",
      });
      if (expand) await browser.click(expand);
    }
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    await browser.click(
      screen.getByRole("button", { name: "Copy extraction prompt" }),
    );
    const prompt = copy.mock.calls[0]![0];
    const extracted = JSON.parse(
      prompt
        .split("Șablon pentru CONȚINUTUL fișierului scuter.json:\n")[1]!
        .split("\n\nChei fields")[0]!,
    );
    for (const document of extracted.documents) {
      document.vin = vin;
      if (document.documentType === "civ") {
        document.fields = {
          brandName: "Yamaha",
          vin,
          civNumber: "T943622",
          civVersion: "2024",
          powertrainType: "combustion",
          maxSpeedKmh: 25,
        };
        document.rawFields = { E: vin, T: "25" };
      } else if (document.documentType === "registration_certificate") {
        document.fields = {
          registrationType: "local",
          registrationNumber: "14949",
          registrationDate: "2026-09-01",
          registrationCertificateNumber: "BUJORENI-VL-176/18",
        };
      } else {
        document.fields = {
          insuredName: "DOGARU EMILIANO CONSTANTIN",
          validFrom: "2026-09-13",
          validUntil: "2027-09-12",
          premiumAmount: 278.88,
          currency: "RON",
          documentVin: vin,
        };
      }
    }
    const json = JSON.stringify(extracted);
    const jsonFile = new File([json], "scuter.json", {
      type: "application/json",
    });
    Object.defineProperty(jsonFile, "text", { value: async () => json });
    await browser.upload(
      screen.getByLabelText("Upload JSON", { selector: "input" }),
      jsonFile,
    );
    expect(
      await screen.findByText("File ready: scuter.json"),
    ).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("textbox", { name: "VIN" })).toHaveValue(vin);
    expect(screen.getByLabelText("Plate number")).toHaveValue("14949");
    expect(screen.getByLabelText("Insured name")).toHaveValue(
      "DOGARU EMILIANO CONSTANTIN",
    );
    expect(mocks.api).toHaveBeenCalledTimes(3);
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await browser.click(await screen.findByRole("button", { name: "Finish" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/scooters"));
    const payload = mocks.api.mock.calls.at(-1)![2].json;
    expect(payload).toMatchObject({
      vin,
      requiredLicenseCategory: "none",
      insurancePolicies: [
        { insuredName: "DOGARU EMILIANO CONSTANTIN", premiumAmount: 278.88 },
      ],
    });
    expect(payload.documentDrafts).toEqual(
      documents.map((document) =>
        expect.objectContaining({
          type: document.type,
          fileName: document.fileName,
          extractedData: expect.objectContaining({ vin }),
          ...(document.type === "insurance"
            ? { insurancePolicyId: payload.insurancePolicies[0].id }
            : {}),
        }),
      ),
    );
  }, 15_000);

  it("asks only for an unknown file's type and reprocesses it without uploading again", async () => {
    mockBatchExtraction(["civ"]);
    const fallback = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (path, schema, options) => {
      if (
        path === v1.scooters.ROUTES.documents.startExtractionJob &&
        options.json.source.type === "unclassified"
      )
        throw new ApiError(
          422,
          "Unknown document",
          "DOCUMENT_EXTRACTION_TYPE_UNKNOWN",
        );
      return fallback(path, schema, options);
    });
    const browser = userEvent.setup();
    renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    await browser.upload(
      screen.getByLabelText("Browse files", { selector: "input" }),
      pdf("scan.pdf"),
    );
    expect(
      await screen.findByText(/We could not identify this document/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create scooter" }),
    ).toBeDisabled();
    await browser.click(
      screen.getByRole("combobox", { name: "Document type for scan.pdf" }),
    );
    await browser.click(
      await screen.findByRole("option", {
        name: "Vehicle identity card (CIV)",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "VIN" })).toHaveValue(
        scooter.vin,
      ),
    );
    expect(mocks.put).toHaveBeenCalledTimes(1);
    const attempts = mocks.api.mock.calls.filter(
      ([path]) => path === v1.scooters.ROUTES.documents.startExtractionJob,
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[1]![2].json.source).toMatchObject({
      type: "civ",
      uploadType: "unclassified",
    });
  });

  it("keeps successful files when another fails and retries only the failed file", async () => {
    mockBatchExtraction(["civ", "registration_certificate"]);
    const fallback = mocks.api.getMockImplementation()!;
    let failures = 0;
    mocks.api.mockImplementation(async (path, schema, options) => {
      if (
        path === v1.scooters.ROUTES.documents.startExtractionJob &&
        options.json.source.uploadToken === "token-registration_certificate" &&
        failures++ === 0
      )
        throw new ApiError(422, "Failed", "DOCUMENT_EXTRACTION_FAILED");
      return fallback(path, schema, options);
    });
    const browser = userEvent.setup();
    renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    await browser.upload(
      screen.getByLabelText("Browse files", { selector: "input" }),
      [pdf("one.pdf"), pdf("two.pdf")],
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "VIN" })).toHaveValue(
        scooter.vin,
      ),
    );
    const retry = await screen.findByRole("button", {
      name: "Retry failed documents",
    });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Color"), {
      target: { value: "Blue" },
    });
    await browser.click(retry);
    await waitFor(() =>
      expect(screen.getByLabelText("Plate number")).toHaveValue("14949"),
    );
    expect(screen.getByLabelText("Color")).toHaveValue("Blue");
    expect(mocks.put).toHaveBeenCalledTimes(2);
    expect(
      mocks.api.mock.calls.filter(
        ([path]) => path === v1.scooters.ROUTES.documents.startExtractionJob,
      ),
    ).toHaveLength(3);
  });

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
    expect(screen.getByText("Document 1 of 2")).toBeInTheDocument();
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
    {
      const expand = screen.queryByRole("button", {
        name: "Import more documents",
      });
      if (expand) await browser.click(expand);
    }
    await browser.click(
      screen.getByRole("button", { name: "Remove front.pdf" }),
    );
    expect(screen.getByLabelText("Insured name")).toHaveValue("Example Person");
    {
      const expand = screen.queryByRole("button", {
        name: "Import more documents",
      });
      if (expand) await browser.click(expand);
    }
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
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

  it("previews existing PDFs in the shared full-screen viewer with an open-file fallback", async () => {
    const browser = userEvent.setup();
    renderWithMessages(<Harness />);
    await browser.click(
      screen.getByRole("button", { name: "Preview old.pdf" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "old.pdf" });
    expect(dialog).toHaveClass(
      "h-dvh",
      "bg-popover",
      "text-popover-foreground",
    );
    expect(
      dialog.querySelector('[data-slot="pdf-preview"]'),
    ).toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Document actions" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Open file in new tab" }),
    ).toHaveAttribute(
      "href",
      "https://api.example.com/v1/scooters/s/documents/doc/content",
    );
    await browser.keyboard("{Escape}");
    await browser.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows local image previews and revokes the object URL on removal", async () => {
    const browser = userEvent.setup();
    renderWithMessages(<Harness initial={[]} />);
    const file = new File(["image"], "front.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new ArrayBuffer(4),
    });
    await browser.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      file,
    );
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Save",
      }),
    );
    expect(
      await screen.findByRole("img", { name: "front.png" }),
    ).toHaveAttribute("src", "blob:preview");
    await browser.click(
      screen.getByRole("button", { name: "Preview front.png" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "front.png" }),
    ).toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Document actions" }),
    );
    await browser.click(
      await screen.findByRole("menuitem", { name: "Remove" }),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("retains failed uploads for retry and blocks save until ready", async () => {
    mocks.put.mockResolvedValueOnce({ ok: false });
    const user = userEvent.setup();
    renderWithMessages(<Harness initial={[]} />);
    await user.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      pdf(),
    );
    expect(mocks.api).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Save",
      }),
    );
    expect(await screen.findByText(/Upload failed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save test" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry upload" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save test" })).toBeEnabled(),
    );
    expect(screen.queryByText("Ready to save")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save test" })).toBeEnabled();
    expect(mocks.api).toHaveBeenLastCalledWith(
      v1.scooters.ROUTES.documents.createDraftUpload,
      v1.scooters.scooterDocumentUploadSchema,
      expect.objectContaining({
        json: expect.objectContaining({
          type: "civ",
          contentType: "application/pdf",
        }),
      }),
    );
    await removeFromViewer(user, "CIV.pdf");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
  it("shows only an upload overlay and removes every action below a ready preview", async () => {
    let finish!: (result: { ok: boolean }) => void;
    mocks.put.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const { container } = renderWithMessages(<Harness initial={[]} />);
    await user.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      pdf(),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="document-upload-overlay"]'),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Add Vehicle identity card (CIV)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "CIV.pdf" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove" }),
    ).not.toBeInTheDocument();
    finish({ ok: true });
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="document-upload-overlay"]'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Ready to save")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview CIV.pdf" }),
    ).toHaveAttribute("aria-busy", "false");
  });
  it("rejects unsupported and oversized files before requesting an upload", async () => {
    renderWithMessages(<Harness initial={[]} />);
    const input = screen.getByLabelText("Add Vehicle identity card (CIV)", {
      selector: "input",
    });
    fireEvent.change(input, {
      target: {
        files: [new File(["svg"], "x.svg", { type: "image/svg+xml" })],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unsupported format",
    );
    const file = pdf();
    Object.defineProperty(file, "size", { value: 20_000_000 });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The file is too large. Maximum size: 15 MB.",
    );
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("stages removal, supports undo, and saves document-only edits", async () => {
    const user = userEvent.setup();
    renderWithMessages(
      <ScooterEditForm
        scooter={scooter}
        brands={brands}
        scooterHref="/scooters/s"
      />,
    );
    expect(
      screen.queryByRole("link", { name: "old.pdf" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await removeFromViewer(user, "old.pdf");
    expect(mocks.api).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Undo removal" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await removeFromViewer(user, "old.pdf");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update("s"),
        v1.scooters.scooterSchema,
        {
          method: "PATCH",
          json: { sessionId: "editor-session", removedDocumentIds: ["doc"] },
        },
      ),
    );
  });
  it("includes uploaded drafts when saving and preserves them after a failed save", async () => {
    const user = userEvent.setup();
    renderWithMessages(
      <ScooterEditForm
        scooter={{ ...scooter, documents: [] }}
        brands={brands}
        scooterHref="/scooters/s"
      />,
    );
    await user.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      pdf(),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Save",
      }),
    );
    await browserConfirmVin(user);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
    mocks.api.mockRejectedValueOnce(new Error("Offline"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
    expect(screen.queryByText("Ready to save")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(mocks.api).toHaveBeenLastCalledWith(
      v1.scooters.ROUTES.update("s"),
      v1.scooters.scooterSchema,
      {
        method: "PATCH",
        json: {
          sessionId: "editor-session",
          documentDrafts: [
            { type: "civ", fileName: "CIV.pdf", uploadToken: "token" },
          ],
        },
      },
    );
  });
});

function mockBatchExtraction(
  types: readonly v1.scooters.ScooterDocumentType[],
) {
  const fallback = mocks.api.getMockImplementation()!;
  let uploadIndex = 0;
  mocks.api.mockImplementation(async (path, schema, options) => {
    if (path === v1.scooters.ROUTES.documents.createDraftUpload) {
      const upload = await fallback(path, schema, options);
      return { ...upload, uploadToken: `token-${types[uploadIndex++]}` };
    }
    if (path !== v1.scooters.ROUTES.documents.startExtractionJob)
      return fallback(path, schema, options);
    const { sourceId, source } = options.json;
    const type =
      source.type === "unclassified"
        ? source.uploadToken.slice("token-".length)
        : source.type;
    return {
      sourceId,
      documentType: type,
      reviewRequired: true,
      issues: [],
      extractedData: {
        vin: scooter.vin,
        fields:
          type === "civ" || type === "import_document"
            ? {
                brandName: "Yamaha",
                powertrainType: "combustion",
                maxSpeedKmh: 25,
                color: "White",
              }
            : type === "registration_certificate"
              ? {
                  registrationType: "local",
                  registrationNumber: "14949",
                  registrationDate: "2026-09-01",
                }
              : {
                  insuredName: "Example Person",
                  validFrom: "2026-09-01",
                  validUntil: "2027-08-31",
                  premiumAmount: 278.88,
                  currency: "RON",
                },
        rawFields: {},
      },
    };
  });
}

async function removeFromViewer(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(screen.getByRole("button", { name: `Preview ${name}` }));
  await user.click(screen.getByRole("button", { name: "Document actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
}

async function browserConfirmVin(user: ReturnType<typeof userEvent.setup>) {
  const label = await screen.findByText("I checked CIV.pdf");
  await user.click(label);
}

const access = vi.hoisted(() => ({
  user: { isSuperAdmin: true, effectiveScopes: {} as Record<string, string[]> },
}));
vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => access,
}));

describe("document capabilities", () => {
  it("keeps previews available to readers while hiding upload, replacement, and removal", async () => {
    access.user = {
      isSuperAdmin: false,
      effectiveScopes: { "scooter_documents.read": ["ALL"] },
    };
    const browser = userEvent.setup();
    const view = renderWithMessages(<Harness />);
    expect(view.container.querySelector('input[type="file"]')).toBeNull();
    await browser.click(
      screen.getByRole("button", { name: "Preview old.pdf" }),
    );
    expect(
      screen.queryByRole("button", {
        name: messages.en.scooters.documents.remove,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: messages.en.scooters.documents.change,
      }),
    ).not.toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("hides document controls and previews without document-read permission", () => {
    access.user = { isSuperAdmin: false, effectiveScopes: {} };
    const view = renderWithMessages(<Harness />);
    expect(
      screen.queryByRole("button", { name: "Preview old.pdf" }),
    ).not.toBeInTheDocument();
    expect(view.container.querySelector('input[type="file"]')).toBeNull();
  });
});
