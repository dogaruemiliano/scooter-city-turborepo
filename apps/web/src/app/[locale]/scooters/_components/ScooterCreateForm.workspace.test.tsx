// Register the shared mocks before importing components under test.
import {
  mocks,
  brands,
  renderWizard,
  createdScooter,
  chooseSelectOption,
} from "./ScooterCreateForm.test.fixtures";
import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { scooterEditorDefaults } from "./scooter-editor-schema";
import { expect, it, vi } from "vitest";
import { ScooterEditor } from "./ScooterEditor";
import type { ScooterImportSnapshot } from "./scooter-import-workspace";

it("requires manual registration and plate entry for a classified certificate, ignoring old AI readings", async () => {
  const data = {
    vin: null,
    fields: { registrationType: "local", registrationNumber: "AI PLATE" },
    rawFields: {},
  };
  const state: ScooterImportSnapshot = {
    version: 1,
    values: {
      ...scooterEditorDefaults(),
      vin: createdScooter.vin,
      brandId: brands[0]!.id,
      model: "Manual model",
      powertrainType: "electric",
      registrationType: "unregistered",
    },
    documents: {
      drafts: [
        {
          id: "registration",
          type: "registration_certificate",
          file: {
            name: "registration.pdf",
            type: "application/pdf",
            size: 100,
            lastModified: 1,
          },
          status: "ready",
          uploadToken: "registration-token",
        },
      ],
      extractions: {},
      removedIds: [],
    },
    analysis: {
      entries: {
        registration: {
          status: "success",
          analysis: {
            sourceId: "registration",
            documentType: "registration_certificate",
            extractedData: data,
            issues: [],
            reviewRequired: true,
          },
        },
      },
      cache: [
        [
          JSON.stringify([
            "registration",
            "registration_certificate",
            "registration.pdf",
            100,
            1,
          ]),
          "registration",
        ],
      ],
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
  mocks.apiFetch.mockResolvedValue(createdScooter);
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterEditor
        brands={brands}
        returnHref="/en/scooters"
        initialSnapshot={state}
      />
    </NextIntlClientProvider>,
  );
  const browser = userEvent.setup();
  expect(
    screen.getByText(messages.en.scooters.creation.manualRegistration),
  ).toBeVisible();
  expect(
    screen.getByText(messages.en.scooters.documents.batch.identified),
  ).toBeVisible();
  expect(
    screen.queryByText(messages.en.scooters.documents.batch.read),
  ).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Plate number" })).toBeNull();
  const submit = () =>
    mocks.apiFetch.mock.calls.filter(
      ([path]) => path === v1.scooters.ROUTES.create,
    );
  // Native form submission also exercises the Enter-key path.
  fireEvent.submit(
    screen.getByRole("button", { name: "Create scooter" }).closest("form")!,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Registration type" }),
    ).toHaveAttribute("aria-invalid", "true"),
  );
  expect(submit()).toHaveLength(0);
  await chooseSelectOption(browser, "Registration type", "Local");
  const plate = screen.getByRole("textbox", { name: "Plate number" });
  expect(plate).toHaveValue("");
  await browser.click(screen.getByRole("button", { name: "Create scooter" }));
  await waitFor(() => expect(plate).toHaveAttribute("aria-invalid", "true"));
  expect(submit()).toHaveLength(0);
  await browser.type(plate, "VL 18 167");
  await browser.click(screen.getByRole("button", { name: "Create scooter" }));
  await waitFor(() => expect(submit()).toHaveLength(1));
  expect(submit()[0]?.[2]).toMatchObject({
    json: { registrationType: "local", registrationNumber: "VL 18 167" },
  });
});

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
