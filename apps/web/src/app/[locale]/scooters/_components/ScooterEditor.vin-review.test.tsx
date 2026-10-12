import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { ScooterEditor } from "./ScooterEditor";
import type { DocumentDraft } from "./useScooterDocuments";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ webApi: { fetch: apiFetch } }));
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

it("unblocks the wizard after verified correction and reuses it when returning to documents", async () => {
  const correct = "LXYTCZP05P0000001";
  const misread = "LXYTC2P05P0000001";
  apiFetch.mockImplementation((_route, _schema, { json }) => {
    const vin = json.sourceId === "civ" ? correct : misread;
    const result = {
      sourceId: json.sourceId,
      documentType: json.source.type,
      extractedData: { vin, fields: { vin }, rawFields: { E: vin } },
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
  const user = userEvent.setup();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterEditor brands={[]} returnHref="/en/scooters" />
    </NextIntlClientProvider>,
  );
  await user.click(
    screen.getByRole("button", { name: "Extract and continue" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Check document VINs" }),
  ).toBeInTheDocument();
  expect(screen.getByText("1 / 4 · Documents")).toBeInTheDocument();
  expect(apiFetch).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByLabelText("registration.pdf"), {
    target: { value: correct },
  });
  await user.click(
    screen.getByRole("checkbox", {
      name: "I checked the corrected VINs against the original documents",
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "Apply verified corrections" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Check document VINs" }),
    ).not.toBeInTheDocument(),
  );
  expect(persisted.registration).toMatchObject({
    vin: correct,
    rawFields: { E: misread },
    vinReview: { method: "manual", originalVin: misread },
  });
  expect(apiFetch).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("2 / 4 · CIV")).toBeInTheDocument();
  expect(screen.getByLabelText("VIN")).toHaveValue(correct);
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("2 / 4 · CIV")).toBeInTheDocument();
  expect(apiFetch).toHaveBeenCalledTimes(2);
});

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: { isSuperAdmin: true } }),
}));
