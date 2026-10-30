import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, vi } from "vitest";
import { ScooterDocumentUpload } from "./ScooterDocumentUpload";
import { useScooterDocuments } from "./useScooterDocuments";

// Photo requests are covered by the gallery suite, independently of document uploads.
vi.mock("./ScooterPhotos", () => ({ ScooterPhotos: () => null }));

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  put: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: async (path: string, ...args: unknown[]) => {
      if (/^\/v1\/scooters\/[^/]+\/insurance$/.test(path))
        return { history: [], updatedAt: scooter.updatedAt };
      if (/^\/v1\/scooters\/[^/]+\/itp$/.test(path))
        return {
          inspections: [],
          status: "missing",
          validUntil: null,
          renewalRequired: true,
        };
      if (path === v1.scooters.ROUTES.nextFleetNumber)
        return { fleetNumber: 7 };
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
            documentType:
              (args[1] as { json: { source: { type: string } } }).json.source
                .type ?? result.documentType,
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

export const brands = [
  {
    id: "brand",
    name: "Yamaha",
    code: "YAM",
    scooterCount: 0,
    createdAt: "",
    updatedAt: "",
  },
];

export const existing: v1.scooters.ScooterDocument = {
  id: "doc",
  type: "civ",
  fileName: "old.pdf",
  contentType: "application/pdf",
  byteSize: 50,
  createdAt: "",
  contentUrl: "/v1/scooters/s/documents/doc/content",
};

export const scooter: v1.scooters.Scooter = {
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

export function renderWithMessages(
  child: React.ReactNode,
  locale: "en" | "ro" = "en",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {child}
    </NextIntlClientProvider>,
  );
}

export function Harness({
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

export function pdf(name = "CIV.pdf") {
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

export function mockBatchExtraction(
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

export async function removeFromViewer(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(screen.getByRole("button", { name: `Preview ${name}` }));
  await user.click(screen.getByRole("button", { name: "Document actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
}

const access = vi.hoisted(() => ({
  user: { isSuperAdmin: true, effectiveScopes: {} as Record<string, string[]> },
}));

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => access,
}));

export { mocks, access };
