import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StrictMode, useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScooterImportWorkspace } from "./ScooterImportWorkspace";
import { scooterEditorDefaults } from "./scooter-editor-schema";
import type { ScooterEditorProps } from "./ScooterEditor";
import type { ScooterImportSnapshot } from "./scooter-import-workspace";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  unmount: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/components/WorkspaceNotifications", () => ({
  useWorkspaceNotifications: () => ({ add: mocks.toast }),
}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("./ScooterEditor", () => ({
  ScooterEditor: ({
    importDraft,
    onSnapshot,
    onCreated,
    initialSnapshot,
    incomingFiles,
  }: ScooterEditorProps) => {
    const [text, setText] = useState(initialSnapshot?.values.notes ?? "");
    useEffect(() => () => mocks.unmount(importDraft?.id), [importDraft?.id]);
    return (
      <div>
        {incomingFiles?.files.map((file) => (
          <span key={file.name}>{file.name}</span>
        ))}
        <button
          onClick={() => onSnapshot?.(identifiedSnapshot(importDraft!.id))}
        >
          Detect scooter
        </button>
        <input
          aria-label="Draft note"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button onClick={() => onSnapshot?.(snapshot(text))}>
          Finish analysis
        </button>
        <button
          onClick={() =>
            onCreated?.(
              {
                id: `scooter-${importDraft?.id}`,
                fleetNumber: 7,
                brandCode: "HON",
              } as v1.scooters.Scooter,
              true,
            )
          }
        >
          Create and review next
        </button>
      </div>
    );
  },
}));
function draft(id: string): v1.scooters.ScooterImportDraft {
  return {
    id,
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2026-10-24T00:00:00.000Z",
    revision: 0,
    state: {},
  };
}
function snapshot(note = ""): ScooterImportSnapshot {
  return {
    version: 1,
    values: { ...scooterEditorDefaults(), notes: note },
    documents: { drafts: [], extractions: {}, removedIds: [] },
    analysis: { entries: {}, cache: [], attempts: [] },
    extraction: {
      confirmedSources: [],
      origins: [],
      manual: [],
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
}
function mount() {
  return render(
    <StrictMode>
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterImportWorkspace scootersHref="/en/scooters" brands={[]} />
      </NextIntlClientProvider>
    </StrictMode>,
  );
}
beforeEach(() => {
  sessionStorage.clear();
  mocks.fetch.mockReset();
  mocks.unmount.mockReset();
  mocks.toast.mockReset();
});

describe("persistent scooter import workspace", () => {
  it("recovers edits after refresh while a failed autosave is still pending", async () => {
    mocks.fetch.mockImplementation(async (_path, _schema, options) => {
      if (options?.method === "PATCH") throw new TypeError("Disconnected");
      return { items: [draft("one")] };
    });
    const view = mount();
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Draft note" }),
      { target: { value: "Last correction before refresh" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish analysis" }));
    await screen.findByText(/could not be saved/);
    view.unmount();
    mocks.fetch.mockImplementation(async (_path, _schema, options) =>
      options?.method === "PATCH"
        ? { ...draft("one"), revision: 1, state: options.json.state }
        : { items: [draft("one")] },
    );
    mount();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Draft note" })).toHaveValue(
        "Last correction before refresh",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish analysis" }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.importDrafts.update("one"),
        expect.anything(),
        expect.objectContaining({
          method: "PATCH",
          json: expect.objectContaining({
            revision: 0,
            state: expect.objectContaining({
              values: expect.objectContaining({
                notes: "Last correction before refresh",
              }),
            }),
          }),
        }),
      ),
    );
  });

  it("recognizes its own committed PATCH after losing the response, despite JSON key reordering", async () => {
    let committed: Record<string, unknown> = {};
    mocks.fetch.mockImplementation(async (path, _schema, options) => {
      if (options?.method === "PATCH") {
        committed = Object.fromEntries(
          Object.entries(options.json.state).reverse(),
        );
        throw new ApiError(
          409,
          "Revision changed",
          "IMPORT_DRAFT_REVISION_CONFLICT",
        );
      }
      if (path === v1.scooters.ROUTES.importDrafts.get("one"))
        return { ...draft("one"), revision: 1, state: committed };
      return { items: [draft("one")] };
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Finish analysis" }),
    );
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.importDrafts.get("one"),
        expect.anything(),
        { cache: "no-store" },
      ),
    );
    expect(
      screen.queryByText(/changed in another tab/),
    ).not.toBeInTheDocument();
    expect(sessionStorage.getItem("scooter-import:one:v1")).toBeNull();
  });

  it("creates one initial draft under Strict Mode and leaves other editors mounted while switching", async () => {
    let index = 0;
    mocks.fetch.mockImplementation(async (_path, _schema, options) =>
      options?.method === "POST" ? draft(`draft-${++index}`) : { items: [] },
    );
    mount();
    await screen.findByRole("textbox", { name: "Draft note" });
    expect(index).toBe(1);
    fireEvent.change(screen.getByRole("textbox", { name: "Draft note" }), {
      target: { value: "First scooter correction" },
    });
    mocks.unmount.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: "Add another scooter" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Draft 2/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(
      screen.getAllByRole("textbox", { name: "Draft note", hidden: true }),
    ).toHaveLength(2);
    expect(mocks.unmount).not.toHaveBeenCalledWith("draft-1");
    fireEvent.click(screen.getByRole("button", { name: /Draft 1/ }));
    expect(
      screen.getAllByRole("textbox", { name: "Draft note" })[0],
    ).toHaveValue("First scooter correction");
  });
  it("restores all 20 active drafts and prevents a twenty-first", async () => {
    mocks.fetch.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, index) => draft(`draft-${index}`)),
    });
    mount();
    await screen.findByRole("navigation", { name: "Scooter drafts" });
    expect(
      screen.getByRole("button", { name: "Add another scooter" }),
    ).toBeDisabled();
    expect(
      within(
        screen.getByRole("navigation", { name: "Scooter drafts" }),
      ).getAllByRole("button"),
    ).toHaveLength(20);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("persists review state and discards only after the explicit action", async () => {
    const item = draft("one");
    mocks.fetch.mockImplementation(async (_path, _schema, options) =>
      options?.method === "PATCH"
        ? {
            ...item,
            revision: options.json.revision + 1,
            state: options.json.state,
          }
        : options?.method === "POST"
          ? { ok: true }
          : { items: [item] },
    );
    const view = mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Finish analysis" }),
    );
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.importDrafts.update("one"),
        expect.anything(),
        expect.objectContaining({
          method: "PATCH",
          json: expect.objectContaining({
            revision: 0,
            state: expect.objectContaining({ status: "review" }),
          }),
        }),
      ),
    );
    expect(
      screen.getByRole("button", { name: /Draft 1.*Analysis done/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.importDrafts.discard("one"),
        expect.anything(),
        { method: "POST" },
      ),
    );
    view.unmount();
    expect(
      mocks.fetch.mock.calls.filter(
        ([, , options]) => options?.method === "POST",
      ),
    ).toHaveLength(1);
  });
  it("blocks conflicting revisions instead of overwriting another tab", async () => {
    mocks.fetch.mockImplementation(async (path, _schema, options) => {
      if (
        path === v1.scooters.ROUTES.importDrafts.get("one") &&
        !options?.method
      )
        return { ...draft("one"), revision: 1, state: { otherTab: true } };
      if (options?.method === "PATCH")
        throw new ApiError(409, "conflict", "IMPORT_DRAFT_REVISION_CONFLICT");
      return { items: [draft("one")] };
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Finish analysis" }),
    );
    await screen.findByText(/changed in another tab/);
    fireEvent.click(screen.getByRole("button", { name: "Save draft changes" }));
    expect(
      mocks.fetch.mock.calls.filter(
        ([, , options]) => options?.method === "PATCH",
      ),
    ).toHaveLength(1);
  });
  it("creation frees a slot and selects the next draft without navigating away", async () => {
    mocks.fetch.mockResolvedValue({ items: [draft("one"), draft("two")] });
    mount();
    fireEvent.click(
      (
        await screen.findAllByRole("button", { name: "Create and review next" })
      )[0]!,
    );
    await screen.findByRole("link", { name: "007 HON" });
    expect(
      within(
        screen.getByRole("navigation", { name: "Scooter drafts" }),
      ).getAllByRole("button"),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Draft 1/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

function identifiedSnapshot(id: string): ScooterImportSnapshot {
  const state = snapshot();
  const vin = "LXYTCKP05P0000001";
  state.values.vin = vin;
  state.extraction.origins.push([
    "vin",
    { field: "vin", lastAuto: vin, baseline: "", sourceIds: [id] },
  ]);
  state.documents.drafts.push({
    id,
    type: "civ",
    file: {
      name: `${id}.pdf`,
      type: "application/pdf",
      size: 100,
      lastModified: 1,
    },
    status: "ready",
    uploadToken: id,
  });
  state.analysis.entries[id] = {
    status: "success",
    analysis: {
      sourceId: id,
      documentType: "civ",
      extractedData: { vin, fields: {}, rawFields: {} },
      issues: [],
      reviewRequired: true,
    },
  };
  state.analysis.cache = [[id, id]];
  return state;
}

it("accepts several one-scooter PDFs at the top and shows their forms below", async () => {
  mocks.fetch.mockImplementation(async (_path, _schema, options) =>
    options?.method === "POST" ? draft("two") : { items: [draft("one")] },
  );
  mount();
  await screen.findByRole("textbox", { name: "Draft note" });
  fireEvent.change(
    screen.getByLabelText("Browse files", { selector: "input" }),
    {
      target: {
        files: [
          new File(["one"], "one.pdf", { type: "application/pdf" }),
          new File(["two"], "two.pdf", { type: "application/pdf" }),
        ],
      },
    },
  );
  await screen.findByText("two.pdf");
  expect(screen.getByText("one.pdf")).toBeInTheDocument();
  expect(screen.getAllByRole("textbox", { name: "Draft note" })).toHaveLength(
    2,
  );
});

it("groups completed PDFs for the same VIN and keeps the destination form edits", async () => {
  const first = identifiedSnapshot("one");
  first.values.notes = "Keep my correction";
  const second = identifiedSnapshot("two");
  mocks.fetch.mockImplementation(async (path, _schema, options) =>
    path === v1.scooters.ROUTES.importDrafts.merge("one")
      ? { ...draft("one"), revision: 1, state: options.json.state }
      : {
          items: [
            { ...draft("one"), state: first },
            { ...draft("two"), state: second },
          ],
        },
  );
  mount();
  await waitFor(() =>
    expect(mocks.fetch).toHaveBeenCalledWith(
      v1.scooters.ROUTES.importDrafts.merge("one"),
      expect.anything(),
      expect.objectContaining({ method: "POST" }),
    ),
  );
  await waitFor(() =>
    expect(screen.getAllByRole("textbox", { name: "Draft note" })).toHaveLength(
      1,
    ),
  );
  expect(screen.getByRole("textbox", { name: "Draft note" })).toHaveValue(
    "Keep my correction",
  );
  const request = mocks.fetch.mock.calls.find(
    ([path]) => path === v1.scooters.ROUTES.importDrafts.merge("one"),
  )!;
  expect(request[2].json.state.documents.drafts).toHaveLength(2);
});

it("updates the draft state without a detection toast", async () => {
  mocks.fetch.mockImplementation(async (_path, _schema, options) =>
    options?.method === "PATCH"
      ? { ...draft("one"), revision: 1, state: options.json.state }
      : { items: [draft("one")] },
  );
  mount();
  const detect = await screen.findByRole("button", { name: "Detect scooter" });
  fireEvent.click(detect);
  fireEvent.click(detect);
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: /Draft 1.*Analysis done/ }),
  ).toHaveClass("bg-warning-subtle", "text-warning");
  const rail = screen.getByRole("region", { name: "Scooter drafts" });
  expect(rail).toHaveClass(
    "[mask-image:linear-gradient(to_right,var(--scroll-fade-start),currentColor_var(--spacing-6),currentColor_calc(100%_-_var(--spacing-6)),var(--scroll-fade-end))]",
  );
  expect(
    screen.getByRole("navigation", { name: "Scooter drafts" }),
  ).toHaveClass("w-max", "md:flex-wrap");
  expect(rail.closest('[data-slot="horizontal-scroll-area"]')).toHaveClass(
    "-mx-(--page-gutter)",
    "md:mx-0",
  );
});

it.each([
  ["empty", "bg-control"],
  ["uploading", "bg-info-subtle"],
  ["queued", "bg-info-subtle"],
  ["analysing", "bg-info-subtle"],
  ["review", "bg-warning-subtle"],
  ["attention", "bg-destructive-subtle"],
  ["ready", "bg-success-subtle"],
] as const)("colors %s drafts by state", async (status, color) => {
  mocks.fetch.mockResolvedValue({
    items: [{ ...draft("one"), state: { ...snapshot(), status } }],
  });
  mount();
  await screen.findByRole("navigation", { name: "Scooter drafts" });
  expect(
    within(
      screen.getByRole("navigation", { name: "Scooter drafts" }),
    ).getByRole("button"),
  ).toHaveClass(color);
});
