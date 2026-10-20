import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

it("unblocks the combined review after verified VIN correction without re-extraction", async () => {
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
  expect(
    screen.queryByRole("dialog", { name: "Verify the scooter VIN" }),
  ).not.toBeInTheDocument();
  const validate = await screen.findByRole("button", {
    name: messages.en.scooters.creation.validateDocuments,
  });
  await waitFor(() => expect(validate).toBeEnabled());
  await user.click(validate);
  expect(
    await screen.findByRole("heading", { name: "Verify the scooter VIN" }),
  ).toBeInTheDocument();
  expect(apiFetch).toHaveBeenCalledTimes(2);
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Verify the scooter VIN" }),
    ).not.toBeInTheDocument(),
  );
  expect(persisted.registration?.vinReview).toBeUndefined();
  expect(apiFetch).toHaveBeenCalledTimes(2);
  await user.click(
    screen.getByRole("button", {
      name: messages.en.scooters.creation.validateDocuments,
    }),
  );
  expect(
    screen.getByRole("dialog", { name: "Verify the scooter VIN" }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Verified scooter VIN"), {
    target: { value: correct },
  });
  await user.click(
    screen.getByRole("button", { name: "Continue to document review" }),
  );
  const finish = screen.getByRole("button", { name: /Confirm & finish/ });
  expect(finish).toBeDisabled();
  await waitFor(() => expect(finish).toBeEnabled(), { timeout: 4000 });
  await user.click(finish);
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Verify mismatched documents" }),
    ).not.toBeInTheDocument(),
  );
  expect(persisted.registration).toMatchObject({
    vin: correct,
    rawFields: { E: misread },
    vinReview: { method: "manual", originalVin: misread },
  });
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText("VIN")).toHaveValue(correct);
  expect(screen.getByRole("button", { name: "Create scooter" })).toBeEnabled();
  expect(apiFetch).toHaveBeenCalledTimes(2);
});

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: { isSuperAdmin: true } }),
}));
