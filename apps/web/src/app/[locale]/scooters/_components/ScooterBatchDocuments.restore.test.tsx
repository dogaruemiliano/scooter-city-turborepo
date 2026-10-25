import { messages } from "@repo/i18n";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScooterBatchDocuments } from "./ScooterBatchDocuments";
import {
  useScooterDocuments,
  type ScooterDocumentsSnapshot,
} from "./useScooterDocuments";

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: { isSuperAdmin: true } }),
}));
vi.mock("@/lib/api", () => ({ webApi: { url: (path: string) => path } }));
const download = vi.fn();
let intersect: IntersectionObserverCallback;
const snapshot: ScooterDocumentsSnapshot = {
  drafts: [
    {
      id: "original",
      type: "civ",
      status: "ready",
      uploadToken: "saved-upload",
      file: {
        name: "original.jpg",
        type: "image/jpeg",
        size: 5,
        lastModified: 1,
      },
    },
  ],
  extractions: {},
  removedIds: [],
};
function RestoredDocuments() {
  const documents = useScooterDocuments([], {
    snapshot,
    session: { id: "draft-one", expiresAt: "2099-01-01T00:00:00Z" },
  });
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterBatchDocuments
        documents={documents}
        disabled={false}
        analyzing={false}
      />
    </NextIntlClientProvider>
  );
}
beforeEach(() => {
  download.mockReset();
  download.mockImplementation(
    async () => new Response(new Blob(["image"], { type: "image/jpeg" })),
  );
  vi.stubGlobal("fetch", download);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:restored-document");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function visibility(isIntersecting: boolean) {
  act(() =>
    intersect(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
}
it("restores a visible thumbnail from the private upload after reload without opening the viewer", async () => {
  const view = render(<RestoredDocuments />);
  expect(download).not.toHaveBeenCalled();
  visibility(false);
  expect(download).not.toHaveBeenCalled();
  visibility(true);
  await waitFor(() =>
    expect(screen.getByAltText("original.jpg")).toHaveAttribute(
      "src",
      "blob:restored-document",
    ),
  );
  expect(download).toHaveBeenCalledExactlyOnceWith(
    "/v1/scooters/import-drafts/draft-one/document-content",
    expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: expect.objectContaining({ "X-Requested-With": "fetch" }),
      body: JSON.stringify({
        sourceId: "original",
        source: { kind: "draft", type: "civ", uploadToken: "saved-upload" },
      }),
    }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.rerender(<RestoredDocuments />);
  expect(download).toHaveBeenCalledTimes(1);
});
it("keeps failed thumbnail downloads retryable without an automatic request loop", async () => {
  download.mockResolvedValueOnce(new Response(null, { status: 503 }));
  render(<RestoredDocuments />);
  visibility(true);
  await screen.findByText(messages.en.scooters.documents.pdfPreviewError);
  expect(download).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", {
      name: messages.en.scooters.documents.preview.replace(
        "{name}",
        "original.jpg",
      ),
    }),
  );
  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="document-preview-card"] img'),
    ).toHaveAttribute("src", "blob:restored-document"),
  );
  expect(download).toHaveBeenCalledTimes(2);
  const viewer = await screen.findByRole("dialog", { name: "original.jpg" });
  expect(viewer).toHaveAttribute("data-slot", "document-viewer");
  expect(viewer).toHaveClass("inset-0", "h-dvh", "w-full", "max-w-none");
});
