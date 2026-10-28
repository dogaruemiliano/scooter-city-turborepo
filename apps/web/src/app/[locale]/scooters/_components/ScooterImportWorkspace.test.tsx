import { PageHeaderActionsContext } from "@/components/PageHeaderActions";
import { ApiError, v1 } from "@repo/api-shared";
import { scrollFade } from "@repo/theme";
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
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
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
    draftActions,
  }: ScooterEditorProps) => {
    const [text, setText] = useState(initialSnapshot?.values.notes ?? "");
    useEffect(() => () => mocks.unmount(importDraft?.id), [importDraft?.id]);
    return (
      <div>
        {draftActions && !draftActions.hasOtherDrafts ? (
          <button onClick={draftActions.onDiscard}>Cancel</button>
        ) : null}
        <button
          onClick={() => onSnapshot?.(identifiedSnapshot(importDraft!.id))}
        >
          Detect scooter
        </button>
        <button
          onClick={() => {
            const pending = identifiedSnapshot(importDraft!.id);
            pending.documents.drafts[0]!.status = "uploading";
            onSnapshot?.(pending);
          }}
        >
          Start upload
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
function mount(header?: HTMLElement) {
  return render(
    <StrictMode>
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <PageHeaderActionsContext
          value={{ isMobile: Boolean(header), target: header ?? null }}
        >
          <ScooterImportWorkspace scootersHref="/en/scooters" brands={[]} />
        </PageHeaderActionsContext>
      </NextIntlClientProvider>
    </StrictMode>,
  );
}
beforeEach(() => {
  sessionStorage.clear();
  mocks.fetch.mockReset();
  mocks.unmount.mockReset();
  mocks.toast.mockReset();
  mocks.push.mockReset();
  mocks.refresh.mockReset();
});

describe("persistent scooter import workspace", () => {
  it("shows only the content for a single draft waiting for documents", async () => {
    mocks.fetch.mockResolvedValue({ items: [draft("one")] });
    mount();
    await screen.findByRole("textbox", { name: "Draft note" });
    expect(
      screen.queryByRole("navigation", { name: "Scooter drafts" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Draft 1/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Discard draft" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add more scooters in parallel" }),
    ).not.toBeInTheDocument();
  });

  it("waits for a completed upload and keeps the single-draft view if creating another draft fails", async () => {
    mocks.fetch.mockImplementation(async (_path, _schema, options) => {
      if (options?.method === "POST") throw new Error("Disconnected");
      if (options?.method === "PATCH")
        return { ...draft("one"), revision: 1, state: options.json.state };
      return { items: [draft("one")] };
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Start upload" }),
    );
    expect(
      screen.queryByRole("button", { name: "Add more scooters in parallel" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detect scooter" }));
    const add = await screen.findByRole("button", {
      name: "Add more scooters in parallel",
    });
    expect(add.closest("nav")).toHaveAttribute("aria-label", "Scooter drafts");
    fireEvent.click(add);
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("heading", { name: /Draft/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Discard draft" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Draft note" }),
    ).toBeInTheDocument();
    expect(add).toBeEnabled();
  });

  it("reveals add in the mobile navigation header and introduces draft controls only after creation succeeds", async () => {
    mocks.fetch.mockImplementation(async (_path, _schema, options) => {
      if (options?.method === "PATCH")
        return { ...draft("one"), revision: 1, state: options.json.state };
      if (options?.method === "POST") return draft("two");
      return { items: [draft("one")] };
    });
    const header = document.createElement("header");
    document.body.append(header);
    const view = mount(header);
    try {
      fireEvent.click(
        await screen.findByRole("button", { name: "Detect scooter" }),
      );
      const add = await within(header).findByRole("button", {
        name: "Add more scooters in parallel",
      });
      expect(add).toHaveClass("animate-in", "motion-reduce:animate-none");
      expect(
        screen.queryByRole("heading", { name: /Draft 1/ }),
      ).not.toBeInTheDocument();
      fireEvent.click(add);
      const title = await screen.findByRole("heading", { name: /Draft 2/ });
      expect(title.parentElement).toHaveClass("animate-in");
      expect(title).toHaveFocus();
      expect(
        within(
          screen.getByRole("navigation", { name: "Scooter drafts" }),
        ).getByRole("button", { name: /Draft 1/ }),
      ).toBeInTheDocument();
      expect(within(header).queryByRole("button")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Draft 1/ }));
      expect(within(header).queryByRole("button")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Draft 2/ }));
      fireEvent.click(screen.getByRole("button", { name: "Detect scooter" }));
      expect(
        await within(header).findByRole("button", {
          name: "Add more scooters in parallel",
        }),
      ).toBeInTheDocument();
    } finally {
      view.unmount();
      header.remove();
    }
  });

  it("keeps documents in their draft when analysis cannot identify a VIN", async () => {
    const state = identifiedSnapshot("one");
    const result = state.analysis.entries.one;
    if (result.status === "success") result.analysis.extractedData.vin = null;
    state.assignment = "obsolete-target";
    mocks.fetch.mockResolvedValue({ items: [{ ...draft("one"), state }] });
    mount();
    await screen.findByRole("textbox", { name: "Draft note" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

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

  it("creates one initial draft under Strict Mode", async () => {
    let index = 0;
    mocks.fetch.mockImplementation(async (_path, _schema, options) =>
      options?.method === "POST" ? draft(`draft-${++index}`) : { items: [] },
    );
    mount();
    await screen.findByRole("textbox", { name: "Draft note" });
    expect(index).toBe(1);
  });
  it("leaves restored editors mounted while switching", async () => {
    mocks.fetch.mockResolvedValue({
      items: [draft("draft-1"), draft("draft-2")],
    });
    mount();
    await screen.findByRole("button", { name: /Draft 2/ });
    fireEvent.change(
      screen.getAllByRole("textbox", { name: "Draft note" })[0],
      {
        target: { value: "First scooter correction" },
      },
    );
    mocks.unmount.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Draft 2/ }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Draft 2/ })).toHaveFocus(),
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
  it("keeps add parallel last, and moves the selected badge into the title row", async () => {
    mocks.fetch.mockResolvedValue({
      items: [
        { ...draft("one"), state: identifiedSnapshot("one") },
        { ...draft("two"), state: identifiedSnapshot("two") },
        { ...draft("three"), state: identifiedSnapshot("three") },
      ],
    });
    mount();
    const nav = await screen.findByRole("navigation", {
      name: "Scooter drafts",
    });
    await within(nav).findByRole("button", { name: /Draft 2/ });
    expect(
      within(nav).queryByRole("button", { name: /Draft 1/ }),
    ).not.toBeInTheDocument();
    expect(within(nav).getAllByRole("button").at(-1)).toHaveTextContent(
      "Add more scooters in parallel",
    );
    fireEvent.click(within(nav).getByRole("button", { name: /Draft 2/ }));
    expect(
      within(nav).queryByRole("button", { name: /Draft 2/ }),
    ).not.toBeInTheDocument();
    expect(
      within(nav).getByRole("button", { name: /Draft 1/ }),
    ).toBeInTheDocument();
    const title = screen.getByRole("heading", { name: /Draft 2/ });
    expect(within(nav).getByRole("button", { name: /Draft 1/ })).toHaveClass(
      "rounded-full",
    );
    expect(
      within(nav).getByRole("button", {
        name: "Add more scooters in parallel",
      }),
    ).toHaveClass("rounded-full");
    expect(title.querySelector('[data-draft-motion="two"]')).toHaveClass(
      "rounded-lg",
    );
    expect(title).toHaveFocus();
    expect(title.parentElement).toContainElement(
      screen.getByRole("button", { name: "Discard draft" }),
    );
    expect(
      screen.queryByText(messages.en.scooters.workspace.pdfHint),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Draft note" })).toHaveLength(
      1,
    );
  });

  it("creates and selects a parallel draft without losing the current form", async () => {
    mocks.fetch.mockImplementation(async (_path, _schema, options) =>
      options?.method === "POST"
        ? draft("two")
        : { items: [{ ...draft("one"), state: identifiedSnapshot("one") }] },
    );
    mount();
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Draft note" }),
      { target: { value: "Keep this edit" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add more scooters in parallel" }),
    );
    await screen.findByRole("heading", { name: /Draft 2/ });
    expect(
      screen.getAllByRole("textbox", { name: "Draft note", hidden: true }),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Draft 1/ }));
    expect(screen.getByRole("textbox", { name: "Draft note" })).toHaveValue(
      "Keep this edit",
    );
  });

  it("hides add parallel for a new empty draft until documents are added, and hides it again when removed", async () => {
    mocks.fetch.mockImplementation(async (_path, _schema, options) => {
      if (options?.method === "PATCH")
        return { ...draft("one"), revision: 1, state: options.json.state };
      if (options?.method === "POST") return draft("two");
      return { items: [draft("one")] };
    });
    mount();
    await screen.findByRole("textbox", { name: "Draft note" });
    expect(
      screen.queryByRole("button", { name: "Add more scooters in parallel" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detect scooter" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Add more scooters in parallel",
      }),
    );
    await screen.findByRole("heading", { name: /Draft 2/ });
    expect(
      screen.queryByRole("button", { name: "Add more scooters in parallel" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Draft 1/ }));
    expect(
      screen.queryByRole("button", { name: "Add more scooters in parallel" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Draft 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Detect scooter" }));
    expect(
      await screen.findByRole("button", {
        name: "Add more scooters in parallel",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish analysis" }));
    fireEvent.click(screen.getByRole("button", { name: /Draft 1/ }));
    expect(
      screen.queryByRole("button", { name: "Add more scooters in parallel" }),
    ).not.toBeInTheDocument();
  });

  it("restores all 20 active drafts and prevents a twenty-first", async () => {
    mocks.fetch.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, index) => ({
        ...draft(`draft-${index}`),
        state: identifiedSnapshot(`file-${index}`),
      })),
    });
    mount();
    await screen.findByRole("navigation", { name: "Scooter drafts" });
    expect(
      within(
        screen.getByRole("navigation", { name: "Scooter drafts" }),
      ).getAllByRole("button"),
    ).toHaveLength(20);
    expect(
      screen.getByRole("button", { name: "Add more scooters in parallel" }),
    ).toBeDisabled();
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
          : { items: [item, draft("two")] },
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
      screen.getByRole("heading", { name: /Draft 1.*Analysis done/ })
        .firstElementChild,
    ).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Draft 1" })).getByRole(
        "button",
        { name: "Discard draft" },
      ),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Discard this scooter draft?",
    });
    expect(
      mocks.fetch.mock.calls.some(
        ([path]) => path === v1.scooters.ROUTES.importDrafts.discard("one"),
      ),
    ).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep draft" }));
    expect(
      screen.getByRole("textbox", { name: "Draft note" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Draft 1" })).getByRole(
        "button",
        { name: "Discard draft" },
      ),
    );
    fireEvent.click(
      within(
        await screen.findByRole("dialog", {
          name: "Discard this scooter draft?",
        }),
      ).getByRole("button", { name: "Discard draft" }),
    );
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
  it("keeps the confirmation open with the original discard action after failure", async () => {
    mocks.fetch.mockImplementation(async (path) => {
      if (path === v1.scooters.ROUTES.importDrafts.discard("one"))
        throw new Error("Disconnected");
      return { items: [draft("one"), draft("two")] };
    });
    mount();
    await screen.findByRole("textbox", { name: "Draft note" });
    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Discard this scooter draft?",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Discard draft" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      messages.en.scooters.workspace.discardFailed,
    );
    expect(
      within(dialog).getByRole("button", { name: "Discard draft" }),
    ).toBeEnabled();
    expect(
      screen.getAllByRole("textbox", { name: "Draft note", hidden: true })[0],
    ).toBeInTheDocument();
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
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      title: "Scooter created",
      description: "007 HON",
      variant: "success",
    });
    expect(
      screen.queryByRole("navigation", { name: "Scooter drafts" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Draft 1/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Discard draft" }),
    ).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Create and review next" }),
    );
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
      "/en/scooters/scooter-two",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
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

it("never merges restored drafts with matching VINs or legacy assignments", async () => {
  const first = identifiedSnapshot("one");
  first.values.notes = "First draft edit";
  const second = identifiedSnapshot("two");
  second.values.notes = "Second draft edit";
  second.assignment = "one";
  mocks.fetch.mockResolvedValue({
    items: [
      { ...draft("one"), state: first },
      { ...draft("two"), state: second },
    ],
  });
  mount();
  await screen.findByRole("textbox", { name: "Draft note" });
  expect(
    screen.getAllByRole("textbox", { name: "Draft note", hidden: true }),
  ).toHaveLength(2);
  expect(screen.getByRole("textbox", { name: "Draft note" })).toHaveValue(
    "First draft edit",
  );
  fireEvent.click(screen.getByRole("button", { name: /Draft 2/ }));
  expect(screen.getByRole("textbox", { name: "Draft note" })).toHaveValue(
    "Second draft edit",
  );
  expect(mocks.fetch).toHaveBeenCalledOnce();
});

it("opens the created scooter details when the only draft is completed", async () => {
  mocks.fetch.mockResolvedValue({ items: [draft("one")] });
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Create and review next" }),
  );
  await screen.findByRole("link", { name: "007 HON" });
  expect(
    screen.queryByRole("textbox", { name: "Draft note" }),
  ).not.toBeInTheDocument();
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
    "/en/scooters/scooter-one",
  );
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("updates the draft state without a detection toast", async () => {
  mocks.fetch.mockImplementation(async (_path, _schema, options) =>
    options?.method === "PATCH"
      ? { ...draft("one"), revision: 1, state: options.json.state }
      : { items: [draft("one"), draft("two")] },
  );
  mount();
  const detect = await screen.findByRole("button", { name: "Detect scooter" });
  fireEvent.click(detect);
  fireEvent.click(detect);
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(
    screen.getByRole("heading", { name: /Draft 1.*Analysis done/ })
      .firstElementChild,
  ).toHaveClass("bg-warning-subtle", "text-warning");
  const rail = screen.getByRole("region", { name: "Scooter drafts" });
  expect(rail.style.maskImage).toBe(scrollFade.softMask);
  expect(
    screen.getByRole("navigation", { name: "Scooter drafts" }),
  ).toHaveClass("w-max");
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
    items: [
      { ...draft("one"), state: { ...snapshot(), status } },
      draft("two"),
    ],
  });
  mount();
  await screen.findByRole("navigation", { name: "Scooter drafts" });
  expect(
    screen.getByRole("heading", { name: /Draft 1/ }).firstElementChild,
  ).toHaveClass(color);
});

it("confirms the sole draft's bottom Cancel before deleting progress and leaving", async () => {
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
  mount();
  fireEvent.change(await screen.findByRole("textbox", { name: "Draft note" }), {
    target: { value: "Keep until I confirm" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Finish analysis" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Discard this scooter draft?",
  });
  expect(
    mocks.fetch.mock.calls.some(
      ([path]) => path === v1.scooters.ROUTES.importDrafts.discard("one"),
    ),
  ).toBe(false);
  expect(mocks.push).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Keep draft" }));
  expect(screen.getByRole("textbox", { name: "Draft note" })).toHaveValue(
    "Keep until I confirm",
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(
    within(
      await screen.findByRole("dialog", {
        name: "Discard this scooter draft?",
      }),
    ).getByRole("button", { name: "Discard draft" }),
  );
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/en/scooters"),
  );
  expect(
    mocks.fetch.mock.calls.filter(
      ([path]) => path === v1.scooters.ROUTES.importDrafts.discard("one"),
    ),
  ).toHaveLength(1);
  expect(
    screen.queryByRole("textbox", { name: "Draft note" }),
  ).not.toBeInTheDocument();
});
it("preserves autosaved progress across navigation away and a return visit without discarding", async () => {
  let saved = draft("one");
  mocks.fetch.mockImplementation(async (_path, _schema, options) => {
    if (options?.method === "PATCH") {
      saved = {
        ...saved,
        revision: saved.revision + 1,
        state: options.json.state,
      };
      return saved;
    }
    return { items: [saved] };
  });
  const view = mount();
  fireEvent.change(await screen.findByRole("textbox", { name: "Draft note" }), {
    target: { value: "Resume from Back" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Finish analysis" }));
  await waitFor(() =>
    expect(saved.state).toMatchObject({
      values: { notes: "Resume from Back" },
    }),
  );
  // Both header Back and browser Back unmount the route without invoking Cancel.
  fireEvent(window, new PageTransitionEvent("pagehide", { persisted: false }));
  view.unmount();
  mount();
  expect(
    await screen.findByRole("textbox", { name: "Draft note" }),
  ).toHaveValue("Resume from Back");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    mocks.fetch.mock.calls.some(
      ([path]) => path === v1.scooters.ROUTES.importDrafts.discard("one"),
    ),
  ).toBe(false);
});
