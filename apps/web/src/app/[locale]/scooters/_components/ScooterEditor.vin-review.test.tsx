import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { ScooterEditor } from "./ScooterEditor";
vi.mock("./ScooterPhotos", () => ({ ScooterPhotos: () => null }));
import type { DocumentDraft } from "./useScooterDocuments";

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

it("fills the CIV VIN once and ignores a legacy Romanian registration VIN without asking again", async () => {
  const correct = "LXYTCZP05P0000001";
  const misread = "LXYTC2P05P0000001";
  apiFetch.mockImplementation((_route, _schema, { json }) => {
    const vin = json.sourceId === "civ" ? correct : misread;
    const result = {
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
    return Promise.resolve({
      id: `job-${json.sourceId}`,
      sourceId: json.sourceId,
      documentType: json.source.type,
      status: "completed",
      result,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterEditor brands={[]} returnHref="/en/scooters" />
    </NextIntlClientProvider>,
  );
  expect(
    screen.queryByRole("dialog", { name: "Verify the scooter VIN" }),
  ).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByLabelText("VIN")).toHaveValue(correct),
  );
  expect(
    screen.queryByRole("button", {
      name: messages.en.scooters.creation.validateDocuments,
    }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(persisted.registration?.vin).toBeNull());
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(
    screen.queryByRole("region", { name: "Review identified documents" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("I reviewed this document and its pages."),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create scooter" })).toBeEnabled();
});

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: { isSuperAdmin: true } }),
}));
