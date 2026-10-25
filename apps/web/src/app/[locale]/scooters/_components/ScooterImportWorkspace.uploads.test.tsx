import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScooterImportWorkspace } from "./ScooterImportWorkspace";

const mocks = vi.hoisted(() => ({ api: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.api } }));
vi.mock("@/components/WorkspaceNotifications", () => ({
  useWorkspaceNotifications: () => ({ add: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({
    user: {
      effectiveScopes: {
        "scooter_documents.read": ["ALL"],
        "scooter_documents.write": ["ALL"],
      },
    },
  }),
}));
// Gallery requests are unrelated to the document-to-scooter ownership contract.
vi.mock("./ScooterPhotos", () => ({ ScooterPhotos: () => null }));

function draft(id: string): v1.scooters.ScooterImportDraft {
  return {
    id,
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2026-10-24T00:00:00.000Z",
    revision: 0,
    state: {},
  };
}

function pdf(name: string) {
  const file = new File(["%PDF"], name, { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new ArrayBuffer(4),
  });
  return file;
}

function mount() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterImportWorkspace scootersHref="/en/scooters" brands={[]} />
    </NextIntlClientProvider>,
  );
}

function uploads() {
  return mocks.api.mock.calls.filter(
    ([path]) => path === v1.scooters.ROUTES.documents.createDraftUpload,
  );
}

function expectNoDraftReassignment() {
  expect(
    mocks.api.mock.calls.some(
      ([path, , options]) =>
        path === v1.scooters.ROUTES.importDrafts.create &&
        options?.method === "POST",
    ),
  ).toBe(false);
  expect(
    mocks.api.mock.calls.some(([path]) => String(path).endsWith("/merge")),
  ).toBe(false);
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  let id = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () =>
      `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    subtle: { digest: async () => new ArrayBuffer(32) },
  });
  vi.stubGlobal("fetch", mocks.put);
  mocks.put.mockResolvedValue({ ok: true });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  const saved = new Map(["one", "two"].map((key) => [key, draft(key)]));
  mocks.api.mockImplementation(async (path, _schema, options) => {
    if (path === v1.scooters.ROUTES.importDrafts.list)
      return { items: [...saved.values()] };
    if (path === v1.scooters.ROUTES.importDrafts.discard("one"))
      return { ok: true };
    if (path === v1.scooters.ROUTES.nextFleetNumber) return { fleetNumber: 7 };
    if (path === v1.scooters.ROUTES.documents.createDraftUpload)
      return {
        uploadUrl: "https://storage.example.com/upload",
        uploadToken: `upload-${++id}`,
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        expiresAt: "2099-01-01T00:00:00.000Z",
        maxBytes: v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES,
      };
    const current = [...saved.values()].find(
      (entry) => path === v1.scooters.ROUTES.importDrafts.update(entry.id),
    );
    if (current && options?.method === "PATCH") {
      const updated = {
        ...current,
        revision: current.revision + 1,
        state: options.json.state,
      };
      saved.set(current.id, updated);
      return updated;
    }
    throw new Error(`Unexpected API request: ${path}`);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("document uploads stay in their scooter draft", () => {
  it("uses discard and a single create-and-review-next action when multiple drafts remain", async () => {
    mount();
    const selected = await screen.findByRole("group", { name: "Draft 1" });
    expect(
      within(selected).queryByRole("link", { name: "Cancel" }),
    ).not.toBeInTheDocument();
    expect(
      within(selected).queryByRole("button", { name: "Create scooter" }),
    ).not.toBeInTheDocument();
    expect(
      within(selected).getByRole("button", { name: "Create and review next" }),
    ).toBeInTheDocument();
    const discard = within(selected).getAllByRole("button", {
      name: "Discard draft",
    });
    expect(discard).toHaveLength(2);
    expect(discard[0].textContent).toBe("");
    fireEvent.click(discard[1]);
    const dialog = await screen.findByRole("dialog", {
      name: "Discard this scooter draft?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep draft" }));
    expect(
      mocks.api.mock.calls.some(
        ([path]) => path === v1.scooters.ROUTES.importDrafts.discard("one"),
      ),
    ).toBe(false);
    fireEvent.click(discard[1]);
    fireEvent.click(
      within(
        await screen.findByRole("dialog", {
          name: "Discard this scooter draft?",
        }),
      ).getByRole("button", { name: "Discard draft" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Cancel" })).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Create scooter" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create and review next" }),
    ).not.toBeInTheDocument();
  });

  it("uses cancel and a single create action when only one draft remains", async () => {
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (path, ...args) =>
      path === v1.scooters.ROUTES.importDrafts.list
        ? { items: [draft("one")] }
        : original(path, ...args),
    );
    mount();
    const selected = await screen.findByRole("group", { name: "Draft 1" });
    expect(
      within(selected).getByRole("link", { name: "Cancel" }),
    ).toBeInTheDocument();
    expect(
      within(selected).getByRole("button", { name: "Create scooter" }),
    ).toBeInTheDocument();
    expect(
      within(selected).queryByRole("button", {
        name: "Create and review next",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(selected).queryByRole("button", { name: "Discard draft" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Draft 1/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps eight dropped documents in the selected draft without creating scooter drafts", async () => {
    mount();
    const selected = await screen.findByRole("group", { name: "Draft 1" });
    const files = Array.from({ length: 8 }, (_, index) =>
      pdf(`document-${index + 1}.pdf`),
    );
    fireEvent.drop(
      within(selected).getByRole("button", {
        name: messages.en.scooters.documents.batch.drop,
      }),
      { dataTransfer: { files, types: ["Files"] } },
    );
    await waitFor(() => expect(uploads()).toHaveLength(8));
    expect(uploads().map(([, , options]) => options.json.sessionId)).toEqual(
      Array(8).fill("one"),
    );
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(8));
    for (const file of files)
      expect(within(selected).getAllByText(file.name).length).toBeGreaterThan(
        0,
      );
    expectNoDraftReassignment();
  });

  it("uses the newly selected draft for the next file selection and preserves the first draft's files", async () => {
    mount();
    const first = await screen.findByRole("group", { name: "Draft 1" });
    fireEvent.change(first.querySelector('input[type="file"]')!, {
      target: { files: [pdf("first-draft.pdf")] },
    });
    await waitFor(() => expect(uploads()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /^Draft 2/ }));
    const second = screen.getByRole("group", { name: "Draft 2" });
    fireEvent.change(second.querySelector('input[type="file"]')!, {
      target: { files: [pdf("second-draft.pdf")] },
    });
    await waitFor(() => expect(uploads()).toHaveLength(2));
    expect(uploads().map(([, , options]) => options.json.sessionId)).toEqual([
      "one",
      "two",
    ]);
    expect(
      within(second).queryByText("first-draft.pdf"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Draft 1/ }));
    expect(
      within(screen.getByRole("group", { name: "Draft 1" })).getAllByText(
        "first-draft.pdf",
      ).length,
    ).toBeGreaterThan(0);
    expectNoDraftReassignment();
  });

  it("pairs a client copy within its draft and leaves another draft's copy for review", async () => {
    mount();
    const first = await screen.findByRole("group", { name: "Draft 1" });
    fireEvent.change(first.querySelector('input[type="file"]')!, {
      target: { files: [pdf("CIV.pdf"), pdf("CIV client copy.pdf")] },
    });
    await waitFor(() => expect(uploads()).toHaveLength(2));
    expect(
      within(first).queryByText(messages.en.scooters.workspace.copyAssigned),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Draft 2/ }));
    const second = screen.getByRole("group", { name: "Draft 2" });
    fireEvent.change(second.querySelector('input[type="file"]')!, {
      target: { files: [pdf("CIV client copy.pdf")] },
    });
    await waitFor(() => expect(uploads()).toHaveLength(3));
    expect(
      within(second).getByText(
        messages.en.scooters.workspace.copyNeedsOriginal,
      ),
    ).toBeInTheDocument();
    expect(uploads().map(([, , options]) => options.json.sessionId)).toEqual([
      "one",
      "one",
      "two",
    ]);
    expectNoDraftReassignment();
  });
});
