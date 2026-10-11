import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import {
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

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  put: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.api,
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
function renderWithMessages(child: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
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
          maxBytes: 10_485_760,
        }
      : scooter,
  );
  mocks.put.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("Scooter documents", () => {
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
  it("extracts uploaded documents directly, reviews the dynamic steps, and saves only at the end", async () => {
    let nextId = 0;
    vi.mocked(crypto.randomUUID).mockImplementation(
      () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
    );
    const defaultRequest = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (path, schema, options) => {
      if (path !== v1.scooters.ROUTES.documents.extract)
        return defaultRequest(path, schema, options);
      const { sourceId, source } = options.json;
      return {
        sourceId,
        documentType: source.type,
        extractedData: {
          vin: scooter.vin,
          fields:
            source.type === "civ"
              ? {
                  brandName: "Yamaha",
                  powertrainType: "combustion",
                  maxSpeedKmh: 25,
                  powerKw: null,
                }
              : source.type === "registration_certificate"
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
          rawFields:
            source.type === "civ" ? { E: scooter.vin, "P.2": "illegible" } : {},
        },
        issues:
          source.type === "civ"
            ? [{ field: "powerKw", code: "unreadable" }]
            : [],
        reviewRequired: true,
      };
    });
    const browser = userEvent.setup();
    renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    for (const label of [
      "Vehicle identity card (CIV)",
      "Registration certificate",
      "Insurance policy",
    ]) {
      await browser.upload(
        screen.getByLabelText(`Add ${label}`, { selector: "input" }),
        pdf(),
      );
      await browser.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Save",
        }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Extract and continue" }),
        ).toBeEnabled(),
      );
    }
    expect(
      mocks.api.mock.calls.filter(
        ([path]) => path === v1.scooters.ROUTES.documents.extract,
      ),
    ).toHaveLength(0);
    await browser.click(
      screen.getByRole("button", { name: "Extract and continue" }),
    );
    await waitFor(() =>
      expect(screen.getByText("2 / 5 · CIV")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/^VIN/)).toHaveValue(scooter.vin);
    expect(
      screen.getByLabelText(/Power \(kW\)/).closest("[data-field-name]"),
    ).toHaveAttribute("data-warning", "true");
    await browser.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByText("1 field could not be interpreted."),
    ).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    await browser.clear(screen.getByLabelText(/^Maximum speed/));
    await browser.type(screen.getByLabelText(/^Maximum speed/), "45");
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Plate number")).toHaveValue("14949");
    expect(
      screen.getByRole("combobox", { name: "Required driver license" }),
    ).toHaveTextContent("Select license category");
    await browser.click(screen.getByRole("button", { name: "Back" }));
    await browser.clear(screen.getByLabelText(/^Maximum speed/));
    await browser.type(screen.getByLabelText(/^Maximum speed/), "25");
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("combobox", { name: "Required driver license" }),
    ).toHaveTextContent("None");
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Insured name")).toHaveValue("Example Person");
    expect(screen.getByLabelText("Total premium")).toHaveValue("278.88");
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      mocks.api.mock.calls.filter(
        ([path]) => path === v1.scooters.ROUTES.documents.extract,
      ),
    ).toHaveLength(3);
    expect(
      mocks.api.mock.calls.filter(
        ([path]) => path === v1.scooters.ROUTES.create,
      ),
    ).toHaveLength(0);
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/scooters"));
    const payload = mocks.api.mock.calls.at(-1)![2].json;
    expect(payload.requiredLicenseCategory).toBe("none");
    expect(
      payload.documentDrafts.every(
        (document: { extractedData?: unknown }) => document.extractedData,
      ),
    ).toBe(true);
    expect(payload.insurancePolicies[0]).toMatchObject({
      insuredName: "Example Person",
      premiumAmount: 278.88,
      currency: "RON",
    });
  });

  it("requires explicit verification when direct AI cannot read a VIN", async () => {
    const defaultRequest = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (path, schema, options) => {
      if (path !== v1.scooters.ROUTES.documents.extract)
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
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      pdf(),
    );
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Extract and continue" }),
      ).toBeEnabled(),
    );
    await browser.click(
      screen.getByRole("button", { name: "Extract and continue" }),
    );
    const vinConfirmation = await screen.findByRole("checkbox", {
      name: "I checked CIV.pdf",
    });
    expect(screen.getByText("Scooter VIN:")).toHaveTextContent(
      "Not available yet",
    );
    await browser.click(vinConfirmation);
    expect(screen.getByText("1 / 3 · Documents")).toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Extract and continue" }),
    );
    await waitFor(() =>
      expect(screen.getByText("2 / 3 · CIV")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/^VIN/)).toHaveValue("");
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    expect(
      mocks.api.mock.calls.filter(
        ([path]) => path === v1.scooters.ROUTES.documents.extract,
      ),
    ).toHaveLength(1);
  });

  it("imports a downloaded JSON file after uploading all three documents and submits their evidence", async () => {
    let nextId = 0;
    vi.mocked(crypto.randomUUID).mockImplementation(
      () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
    );
    const browser = userEvent.setup();
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
    for (const [index, document] of documents.entries()) {
      const file = pdf();
      Object.defineProperty(file, "name", { value: document.fileName });
      await browser.upload(
        screen.getByLabelText(`Add ${document.label}`, { selector: "input" }),
        file,
      );
      await browser.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Save",
        }),
      );
      await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(index + 1));
    }
    const vin = "L5YAUCZB9H1148984";
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
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
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText(/^VIN/)).toHaveValue(vin);
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Plate number")).toHaveValue("14949");
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Insured name")).toHaveValue(
      "DOGARU EMILIANO CONSTANTIN",
    );
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(mocks.api).toHaveBeenCalledTimes(3);
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
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
  });

  it("groups four document inputs under one title without help and creates only one optional insurance", async () => {
    const browser = userEvent.setup();
    const { container } = renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    expect(
      container.querySelectorAll('input[type="file"][multiple]'),
    ).toHaveLength(4);
    const section = screen
      .getByRole("heading", { name: "Documents", level: 2 })
      .closest("section")!;
    expect(within(section).getAllByRole("heading")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Add Insurance policy" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Add insurance$/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Vehicle identity card (CIV)" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Optional. PDF/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Insured name")).not.toBeInTheDocument();
    const input = container.querySelectorAll(
      'input[type="file"][multiple]',
    )[3]!;
    fireEvent.change(input, { target: { files: [pdf()] } });
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Insured name")).not.toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Complete manually" }),
    );
    await browser.click(
      screen.getByRole("checkbox", { name: "I checked CIV.pdf" }),
    );
    await browser.click(
      screen.getByRole("button", { name: "Complete manually" }),
    );
    expect(screen.getAllByLabelText("Insured name")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Add Insurance policy" }),
    ).not.toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Remove new policy" }),
    );
    expect(
      screen.getByRole("button", { name: "Add Insurance policy" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Insured name")).not.toBeInTheDocument();
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

  it("keeps multiple insurance attachments in one policy", async () => {
    const browser = userEvent.setup();
    renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    await browser.upload(
      screen.getByLabelText("Add Insurance policy", { selector: "input" }),
      [pdf("insurance-front.pdf"), pdf("insurance-back.pdf")],
    );
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(2));
    expect(screen.getByText("2 documents")).toBeInTheDocument();
    await browser.upload(
      screen.getByLabelText("Add another document", { selector: "input" }),
      pdf("insurance-annex.pdf"),
    );
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(3));
    expect(screen.getByText("3 documents")).toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Complete manually" }),
    );
    await browser.click(
      screen.getByRole("checkbox", { name: "I checked insurance-front.pdf" }),
    );
    await browser.click(
      screen.getByRole("checkbox", { name: "I checked insurance-back.pdf" }),
    );
    await browser.click(
      screen.getByRole("checkbox", { name: "I checked insurance-annex.pdf" }),
    );
    await browser.click(
      screen.getByRole("button", { name: "Complete manually" }),
    );
    expect(screen.getAllByLabelText("Insured name")).toHaveLength(1);
    expect(screen.getByText("2 / 3 · Insurance")).toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Remove new policy" }),
    );
    expect(
      screen.getByRole("button", { name: "Add Insurance policy" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Insured name")).not.toBeInTheDocument();
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

  it("shows uploads in source order before revealing any document fields", () => {
    const { container } = renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    const inputs = Array.from(
      container.querySelectorAll('input[type="file"][multiple]'),
    );
    expect(inputs.map((input) => input.getAttribute("aria-label"))).toEqual([
      "Add Import documents",
      "Add Vehicle identity card (CIV)",
      "Add Registration certificate",
      "Add Insurance policy",
    ]);
    expect(screen.queryByLabelText(/VIN/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Registration type"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create scooter" }),
    ).not.toBeInTheDocument();
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
      "The file is too large. Maximum size: 10 MB.",
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
        { method: "PATCH", json: { removedDocumentIds: ["doc"] } },
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
          documentDrafts: [
            { type: "civ", fileName: "CIV.pdf", uploadToken: "token" },
          ],
        },
      },
    );
  });
});

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
