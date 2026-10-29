import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ScooterItpPanel,
  documentHasItpType,
  itpEvidenceDisagrees,
} from "./ScooterItpPanel";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: { id: "admin" } }),
}));
vi.mock("@/lib/access", () => ({ canAccess: () => true }));
vi.mock("./ScooterDocumentUpload", () => ({
  ScooterFilePreview: ({ document }: { document: { fileName: string } }) => (
    <p>{document.fileName}</p>
  ),
}));

const vin = "LXYTCKP05P0000001";
const documents: v1.scooters.ScooterDocument[] = [
  {
    id: "card",
    type: "itp_card",
    fileName: "yellow-card.pdf",
    contentType: "application/pdf",
    byteSize: 100,
    createdAt: "2026-01-01",
    contentUrl: "/card",
    extractedData: { vin, fields: {}, rawFields: {} },
  },
  {
    id: "certificate",
    type: "itp_certificate",
    fileName: "certificate.pdf",
    contentType: "application/pdf",
    byteSize: 100,
    createdAt: "2026-01-01",
    contentUrl: "/certificate",
    extractedData: {
      vin,
      fields: {},
      rawFields: {},
      documents: [
        {
          id: "inspection",
          documentType: "itp_certificate",
          pages: [1],
          vin,
          fields: {},
          rawFields: {},
          inspections: [
            {
              inspectionDate: "2026-01-01",
              validUntil: "2027-01-01",
              result: "passed",
              certificateNumber: "CERT-1",
              odometerKm: 0,
              rawFields: {},
            },
          ],
        },
      ],
    },
  },
];
const record = {
  id: "record",
  inspectionDate: "2026-01-01",
  validUntil: "2027-01-01",
  result: "passed",
  certificateNumber: "CERT-1",
  odometerKm: 0,
  cardDocumentId: "card",
  certificateDocumentId: "certificate",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const empty = {
  inspections: [],
  status: "missing",
  validUntil: null,
  renewalRequired: true,
};
function show(evidence = documents) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterItpPanel
        scooter={{ id: "scooter", documents: evidence } as v1.scooters.Scooter}
      />
    </NextIntlClientProvider>,
  );
}
async function review() {
  const browser = userEvent.setup();
  await browser.click(
    await screen.findByRole("button", {
      name: "Use extracted inspection: 2026-01-01",
    }),
  );
  await browser.click(
    screen.getByRole("checkbox", { name: messages.en.scooters.itp.reviewed }),
  );
  return browser;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockImplementation(
    (_path: string, _schema: unknown, options: { method?: string } = {}) =>
      Promise.resolve(options.method === "POST" ? record : empty),
  );
});
describe("inspection review", () => {
  it("uses logical types instead of the initial upload hint for paired evidence", () => {
    expect(
      documentHasItpType({ ...documents[1]!, type: "itp_card" }, "itp_card"),
    ).toBe(false);
  });
  it("surfaces differing readings between the updated card and certificate", () => {
    const certificate = documents[1]!;
    const logical = certificate.extractedData!.documents![0]!;
    const card = {
      ...documents[0]!,
      extractedData: {
        vin,
        fields: {},
        rawFields: {},
        documents: [
          {
            ...logical,
            documentType: "itp_card" as const,
            inspections: logical.inspections!.map((entry) => ({
              ...entry,
              validUntil: "2026-09-01",
            })),
          },
        ],
      },
    };
    expect(
      itpEvidenceDisagrees(card, certificate, "2026-01-01", "CERT-1"),
    ).toBe(true);
  });
  it("does not let a slow initial history response overwrite a newly confirmed inspection", async () => {
    let initial!: (value: unknown) => void;
    let requests = 0;
    mocks.fetch.mockImplementation(
      (_path: string, _schema: unknown, options: { method?: string } = {}) => {
        if (options.method === "POST") return Promise.resolve(record);
        if (requests++ === 0)
          return new Promise((resolve) => {
            initial = resolve;
          });
        return Promise.resolve({
          inspections: [record],
          status: "active",
          validUntil: "2027-01-01",
          renewalRequired: false,
        });
      },
    );
    show();
    const browser = await review();
    await browser.click(
      screen.getByRole("button", { name: "Confirm inspection" }),
    );
    expect(await screen.findByText("ITP valid")).toBeVisible();
    await act(async () => {
      initial(empty);
      await Promise.resolve();
    });
    expect(screen.getByText("ITP valid")).toBeVisible();
    expect(screen.queryByText("ITP not recorded")).not.toBeInTheDocument();
  });
  it("asks for both renewal scans and never derives validity from CIV issuance", async () => {
    show([]);
    expect(await screen.findByText("ITP not recorded")).toBeVisible();
    expect(screen.getByText(messages.en.scooters.itp.renewal)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Confirm inspection" }),
    ).not.toBeInTheDocument();
  });
  it("confirms extracted dates only after review and sends JSON with both evidence IDs", async () => {
    show();
    const browser = await review();
    await browser.click(
      screen.getByRole("button", { name: "Confirm inspection" }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.fetch).toHaveBeenCalledWith(
      v1.scooters.ROUTES.itp.create("scooter"),
      v1.scooters.scooterItpInspectionSchema,
      {
        method: "POST",
        json: {
          inspectionDate: "2026-01-01",
          validUntil: "2027-01-01",
          result: "passed",
          certificateNumber: "CERT-1",
          odometerKm: 0,
          cardDocumentId: "card",
          certificateDocumentId: "certificate",
          evidenceReviewed: true,
        },
      },
    );
    expect(screen.getByText("Inspection recorded")).toBeVisible();
  });
  it("blocks duplicate click and Enter submissions while pending", async () => {
    let complete!: (value: unknown) => void;
    mocks.fetch.mockImplementation(
      (_path: string, _schema: unknown, options: { method?: string } = {}) =>
        options.method === "POST"
          ? new Promise((resolve) => {
              complete = resolve;
            })
          : Promise.resolve(empty),
    );
    show();
    const browser = await review();
    await browser.click(
      screen.getByRole("button", { name: "Confirm inspection" }),
    );
    fireEvent.submit(
      screen.getByRole("form", { name: "Record inspected documents" }),
    );
    expect(
      mocks.fetch.mock.calls.filter((call) => call[2]?.method === "POST"),
    ).toHaveLength(1);
    complete(record);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });
  it("preserves values and the original action label after failure", async () => {
    mocks.fetch.mockImplementation(
      (_path: string, _schema: unknown, options: { method?: string } = {}) =>
        options.method === "POST"
          ? Promise.reject(new ApiError(503, "Unavailable"))
          : Promise.resolve(empty),
    );
    show();
    const browser = await review();
    await browser.click(
      screen.getByRole("button", { name: "Confirm inspection" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.en.scooters.itp.error,
    );
    expect(screen.getByLabelText("Certificate number")).toHaveValue("CERT-1");
    expect(
      screen.getByRole("button", { name: "Confirm inspection" }),
    ).toBeEnabled();
  });
  it("blocks repeating a conflicting record until a different inspection is selected", async () => {
    mocks.fetch.mockImplementation(
      (_path: string, _schema: unknown, options: { method?: string } = {}) =>
        options.method === "POST"
          ? Promise.reject(new ApiError(409, "Conflict", "ITP_RECORD_CONFLICT"))
          : Promise.resolve(empty),
    );
    show();
    const browser = await review();
    await browser.click(
      screen.getByRole("button", { name: "Confirm inspection" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.en.scooters.itp.conflict,
    );
    expect(
      screen.getByRole("button", { name: "Confirm inspection" }),
    ).toBeDisabled();
  });
});

it("shows the initial RAR inspection without requiring separate ITP evidence before renewal", async () => {
  mocks.fetch.mockResolvedValue({
    inspections: [],
    status: "active",
    validUntil: "2099-01-01",
    renewalRequired: false,
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterItpPanel
        scooter={
          {
            id: "scooter",
            vin,
            civIssuedAt: "2097-01-01",
            documents: [],
          } as unknown as v1.scooters.Scooter
        }
      />
    </NextIntlClientProvider>,
  );
  expect(
    await screen.findByText(
      "Initial RAR inspection: CIV issued 2097-01-01, valid until 2099-01-01.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(messages.en.scooters.itp.missingEvidence),
  ).not.toBeInTheDocument();
});
