import {
  mocks,
  brands,
  scooter,
  renderWithMessages,
  pdf,
  mockBatchExtraction,
  access,
} from "./ScooterDocuments.test-helpers";
import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScooterCreateForm } from "./ScooterCreateForm";

describe("Scooter documents", () => {
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
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
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
    for (const [index, type] of types.entries()) {
      await browser.click(
        screen.getByRole("button", {
          name: `Edit document type for scan-${index}.pdf`,
        }),
      );
      expect(
        screen.getByRole("combobox", {
          name: `Document type for scan-${index}.pdf`,
        }),
      ).toHaveTextContent(messages.en.scooters.documents[type]);
      await browser.keyboard("{Escape}");
    }
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
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(`/scooters/${scooter.id}`),
    );
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

  it("uses the shared manually entered VIN without opening a second VIN review", async () => {
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
    await screen.findByRole("button", {
      name: "Validate the documents",
    });
    expect(
      screen.queryByRole("checkbox", { name: "I checked CIV.pdf" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "VIN" }), {
      target: { value: scooter.vin },
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Validate the documents" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
      await browser.click(
        screen.getByRole("button", {
          name: `Edit document type for ${document.fileName}`,
        }),
      );
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
    expect(
      screen.queryByRole("button", { name: "Import JSON" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Document actions" }));
    await browser.click(
      await screen.findByRole("menuitem", { name: "Import JSON" }),
    );
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
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(`/scooters/${scooter.id}`),
    );
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
      screen.getByRole("button", { name: "Edit document type for scan.pdf" }),
    );
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
});
