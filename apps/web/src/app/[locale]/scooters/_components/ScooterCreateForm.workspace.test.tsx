// Register the shared mocks before importing components under test.
import { mocks, brands, renderWizard } from "./ScooterCreateForm.test.fixtures";
import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { scooterEditorDefaults } from "./scooter-editor-schema";
import { expect, it, vi } from "vitest";
import { ScooterEditor } from "./ScooterEditor";
import type { ScooterImportSnapshot } from "./scooter-import-workspace";

it("restores manual field corrections from a persistent workspace draft after navigation", async () => {
  const draft = {
    id: "workspace-draft",
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2026-10-24T00:00:00.000Z",
    revision: 0,
    state: {},
  };
  let snapshot: ScooterImportSnapshot | undefined;
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterEditor
        embedded
        importDraft={draft}
        onSnapshot={(value) => {
          snapshot = value;
        }}
        returnHref="/en/scooters"
        brands={brands}
      />
    </NextIntlClientProvider>,
  );
  const browser = userEvent.setup();
  await browser.type(
    screen.getByRole("textbox", { name: "VIN" }),
    "JYARN23E0RA123456",
  );
  await browser.type(
    screen.getByRole("textbox", { name: "Model" }),
    "Manual correction",
  );
  await waitFor(() => expect(snapshot?.values.model).toBe("Manual correction"));
  const persisted = JSON.parse(
    JSON.stringify(snapshot),
  ) as ScooterImportSnapshot;
  view.unmount();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterEditor
        embedded
        importDraft={draft}
        initialSnapshot={persisted}
        returnHref="/en/scooters"
        brands={brands}
      />
    </NextIntlClientProvider>,
  );
  expect(screen.getByRole("textbox", { name: "VIN" })).toHaveValue(
    "JYARN23E0RA123456",
  );
  expect(screen.getByRole("textbox", { name: "Model" })).toHaveValue(
    "Manual correction",
  );
  expect(
    mocks.apiFetch.mock.calls.some(
      ([path]) =>
        path === v1.scooters.ROUTES.documents.discardEditorSession(draft.id),
    ),
  ).toBe(false);
});

it("omits manual CIV availability from registration", () => {
  renderWizard();
  expect(
    screen.queryByRole("radiogroup", { name: "CIV availability" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(
      "CIV details or a CIV document confirm it has been issued. The scan may be added later.",
    ),
  ).not.toBeInTheDocument();
});

it("retains a visually detected client copy for assignment without importing its readings", async () => {
  const copyData = {
    clientCopy: true as const,
    vin: "LXYTCKP05P0000001",
    fields: { model: "Protected reading" },
    rawFields: {},
  };
  const state: ScooterImportSnapshot = {
    version: 1,
    values: scooterEditorDefaults(),
    documents: {
      drafts: [
        {
          id: "copy",
          type: "civ",
          file: {
            name: "scan.pdf",
            type: "application/pdf",
            size: 100,
            lastModified: 1,
          },
          status: "ready",
          uploadToken: "copy-token",
        },
      ],
      extractions: {},
      removedIds: [],
    },
    analysis: {
      entries: {
        copy: {
          status: "success",
          analysis: {
            sourceId: "copy",
            documentType: "civ",
            extractedData: copyData,
            issues: [],
            reviewRequired: true,
          },
        },
      },
      cache: [[JSON.stringify(["copy", "civ", "scan.pdf", 100, 1]), "copy"]],
      attempts: [],
    },
    extraction: {
      origins: [],
      manual: [],
      confirmedSources: [],
      automaticBaselines: [],
      rawBySource: [],
    },
    importedRawFields: null,
    importedSignature: null,
    automaticImport: "",
    reviewedDocuments: [],
    createdBrands: [],
    status: "review",
  };
  let persisted: ScooterImportSnapshot | undefined;
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterEditor
        embedded
        brands={brands}
        returnHref="/en/scooters"
        initialSnapshot={state}
        importDraft={{
          id: "session",
          revision: 0,
          state: {},
          expiresAt: "2099-01-01T00:00:00.000Z",
          updatedAt: "2026-10-24T00:00:00.000Z",
        }}
        onSnapshot={(snapshot) => {
          persisted = snapshot;
        }}
      />
    </NextIntlClientProvider>,
  );
  await screen.findByText(messages.en.scooters.documents.clientCopy);
  expect(
    screen.queryByRole("combobox", { name: "Original for scan.pdf" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Use as original" }),
  ).not.toBeInTheDocument();
  await waitFor(() =>
    expect(persisted?.documents.drafts[0].version).toBe("client_copy"),
  );
  expect(screen.getByRole("textbox", { name: "VIN" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Model" })).toHaveValue("");
  expect(persisted?.documents.extractions.copy).toMatchObject({
    clientCopy: true,
  });
  expect(
    screen.getByText(messages.en.scooters.workspace.copyNeedsOriginal),
  ).toBeInTheDocument();
});

it("uses the sole draft's bottom Cancel button to request discard confirmation", async () => {
  const user = userEvent.setup();
  const onDiscard = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterEditor
        returnHref="/en/scooters"
        brands={brands}
        draftActions={{ hasOtherDrafts: false, pending: false, onDiscard }}
      />
    </NextIntlClientProvider>,
  );
  const cancel = screen.getByRole("button", { name: "Cancel" });
  expect(
    screen.queryByRole("link", { name: "Cancel" }),
  ).not.toBeInTheDocument();
  await user.click(cancel);
  expect(onDiscard).toHaveBeenCalledOnce();
  expect(mocks.push).not.toHaveBeenCalled();
});
