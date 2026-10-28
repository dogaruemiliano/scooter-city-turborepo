import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { v1 } from "@repo/api-shared";
import { useScooterDocuments } from "./useScooterDocuments";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), api: vi.fn() }));
vi.mock("./scooter-client-copy", () => ({
  generateScooterClientCopy: mocks.generate,
}));
vi.mock("@/lib/api", () => ({
  webApi: { url: (path: string) => path, fetch: mocks.api },
}));
const original: v1.scooters.ScooterDocument = {
  id: "civ",
  type: "civ",
  fileName: "CIV.png",
  contentType: "image/png",
  contentUrl: "/original.png",
  createdAt: "2026-10-01",
  byteSize: 100,
};
afterEach(async () => {
  cleanup();
  await Promise.resolve();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
describe("client copy generation", () => {
  it("blocks submission while generating, prevents duplicate generation, and uploads only the paired copy", async () => {
    let complete!: (file: File) => void;
    mocks.generate.mockReturnValue(
      new Promise<File>((resolve) => {
        complete = resolve;
      }),
    );
    mocks.api.mockImplementation(async (path: string) =>
      path.endsWith("editor-sessions")
        ? { id: "session", expiresAt: "2099-01-01" }
        : {
            method: "PUT",
            uploadUrl: "/upload",
            uploadToken: "copy-token",
            maxBytes: 1000000,
            headers: {},
          },
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          blob: async () => new Blob(["original"]),
        }),
    );
    vi.stubGlobal("crypto", {
      randomUUID: () => "copy",
      subtle: { digest: async () => new ArrayBuffer(32) },
    });
    const hook = renderHook(() => useScooterDocuments([original]));
    let generating!: Promise<void>;
    act(() => {
      generating = hook.result.current.generateClientCopies();
    });
    expect(hook.result.current.blocked).toBe(true);
    await act(async () => {
      await hook.result.current.generateClientCopies();
    });
    expect(mocks.generate).toHaveBeenCalledOnce();
    await act(async () => {
      complete(
        new File(["protected"], "CIV-client.png", { type: "image/png" }),
      );
      await generating;
    });
    await waitFor(() =>
      expect(hook.result.current.drafts[0]?.status).toBe("ready"),
    );
    expect(hook.result.current.existing).toEqual([original]);
    expect(hook.result.current.drafts[0]).toMatchObject({
      version: "client_copy",
      originalId: "civ",
    });
    expect(hook.result.current.payload.documentDrafts?.[0]).toMatchObject({
      originalDocumentId: "civ",
      fileName: "CIV-client.png",
    });
    expect(hook.result.current.canGenerateClientCopies).toBe(false);
    expect(
      mocks.api.mock.calls.some(([path]) =>
        String(path).includes("extraction"),
      ),
    ).toBe(false);
  });
  it("preserves originals and permits another attempt after generation fails", async () => {
    mocks.generate.mockRejectedValue(new Error("Export failed"));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          blob: async () => new Blob(["original"]),
        }),
    );
    const hook = renderHook(() => useScooterDocuments([original]));
    await act(async () => {
      await hook.result.current.generateClientCopies();
    });
    expect(hook.result.current.existing).toEqual([original]);
    expect(hook.result.current.drafts).toEqual([]);
    expect(hook.result.current.clientCopyError).toBe(true);
    expect(hook.result.current.canGenerateClientCopies).toBe(true);
    expect(hook.result.current.blocked).toBe(false);
  });
});
