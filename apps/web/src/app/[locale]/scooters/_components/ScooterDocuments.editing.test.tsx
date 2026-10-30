import {
  mocks,
  brands,
  scooter,
  renderWithMessages,
  Harness,
  pdf,
  mockBatchExtraction,
  access,
} from "./ScooterDocuments.test-helpers";
import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ScooterEditForm } from "./ScooterEditForm";

describe("Scooter documents", () => {
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
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove old.pdf" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.api).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Undo removal" }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove old.pdf" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
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

  it("analyzes new insurance uploads in edit mode and saves their linked policy", async () => {
    mockBatchExtraction(["insurance"]);
    const user = userEvent.setup();
    renderWithMessages(
      <ScooterEditForm
        scooter={{ ...scooter, documents: [] }}
        brands={brands}
        scooterHref="/scooters/s"
      />,
    );
    await user.upload(
      screen.getByLabelText("Browse files", { selector: "input" }),
      pdf("insurance.pdf"),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update("s"),
        v1.scooters.scooterSchema,
        expect.objectContaining({
          method: "PATCH",
          json: expect.objectContaining({
            insurancePolicies: expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                insuredName: "Example Person",
                validFrom: "2026-09-01",
                validUntil: "2027-08-31",
              }),
            ]),
            documentDrafts: expect.arrayContaining([
              expect.objectContaining({
                type: "insurance",
                fileName: "insurance.pdf",
                insurancePolicyId: expect.any(String),
              }),
            ]),
          }),
        }),
      ),
    );
  });

  it("includes uploaded drafts when saving and preserves them after a failed save", async () => {
    const fallback = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation((path, schema, options) =>
      path === v1.scooters.ROUTES.documents.startExtractionJob
        ? Promise.resolve({
            sourceId: options.json.sourceId,
            documentType: "civ",
            extractedData: { vin: scooter.vin, fields: {}, rawFields: {} },
            issues: [],
            reviewRequired: true,
          })
        : fallback(path, schema, options),
    );
    const user = userEvent.setup();
    renderWithMessages(
      <ScooterEditForm
        scooter={{ ...scooter, documents: [] }}
        brands={brands}
        scooterHref="/scooters/s"
      />,
    );
    await user.upload(
      screen.getByLabelText("Browse files", {
        selector: "input",
      }),
      pdf(),
    );
    expect(screen.queryByText("I checked CIV.pdf")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeEnabled(),
    );
    mocks.api.mockRejectedValueOnce(new Error("Offline"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeEnabled(),
    );
    expect(screen.queryByText("Ready to save")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(mocks.api).toHaveBeenLastCalledWith(
      v1.scooters.ROUTES.update("s"),
      v1.scooters.scooterSchema,
      {
        method: "PATCH",
        json: {
          sessionId: "editor-session",
          civAvailability: "issued",
          documentDrafts: [
            {
              type: "civ",
              fileName: "CIV.pdf",
              uploadToken: "token",
              uploadType: "unclassified",
              extractedData: { vin: scooter.vin, fields: {}, rawFields: {} },
            },
          ],
        },
      },
    );
  });
});

describe("document capabilities", () => {
  it("reextracts saved originals from the menu, preserves manual data, and saves accepted additions explicitly", async () => {
    const { ScooterEditor } = await import("./ScooterEditor");
    const timestamp = "2026-10-29T12:00:00.000Z";
    const edited = { ...scooter, model: "Manual model", updatedAt: timestamp };
    mocks.api.mockImplementation(async (path: string) => {
      if (path === v1.scooters.ROUTES.documents.startExtractionJob)
        return {
          sourceId: "doc",
          documentType: "civ",
          extractedData: {
            vin: scooter.vin,
            fields: { model: "AI model", civIssuedAt: "2025-01-15" },
            rawFields: {},
          },
          issues: [],
          reviewRequired: true,
        };
      if (path === v1.scooters.ROUTES.update(scooter.id)) return edited;
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    renderWithMessages(
      <ScooterEditor
        scooter={edited}
        brands={brands}
        returnHref="/en/scooters"
      />,
    );
    expect(mocks.api).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", {
        name: messages.en.scooters.documents.actions,
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", {
        name: messages.en.scooters.reextraction.action,
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: messages.en.scooters.reextraction.title,
    });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("checkbox", {
          name: messages.en.scooters.fields.model,
        }),
      ).toBeEnabled(),
    );
    expect(
      within(dialog).getByRole("checkbox", {
        name: messages.en.scooters.fields.model,
      }),
    ).not.toBeChecked();
    expect(
      mocks.api.mock.calls.some(
        ([path]) => path === v1.scooters.ROUTES.update(scooter.id),
      ),
    ).toBe(false);
    await user.click(
      within(dialog).getByRole("button", { name: /Apply .* to form/ }),
    );
    expect(
      screen.getByRole("textbox", { name: messages.en.scooters.fields.model }),
    ).toHaveValue("Manual model");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    const patch = mocks.api.mock.calls.find(
      ([path]) => path === v1.scooters.ROUTES.update(scooter.id),
    )!;
    expect(patch[2].json).toMatchObject({
      expectedUpdatedAt: timestamp,
      civIssuedAt: "2025-01-15",
      documentExtractions: [
        {
          documentId: "doc",
          extractedData: { reextractionHistory: [{ evidence: null }] },
        },
      ],
    });
    expect(patch[2].json).not.toHaveProperty("model");
  });

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
