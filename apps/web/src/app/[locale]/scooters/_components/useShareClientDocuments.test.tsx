import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useShareClientDocuments } from "./useShareClientDocuments";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: apiFetch,
    url: (path: string) => `https://api.example.com${path}`,
  },
}));
const download = vi.fn();
const share = vi.fn();
const canShare = vi.fn();
function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {children}
    </NextIntlClientProvider>
  );
}
function document(
  type: v1.scooters.ScooterDocumentType,
): v1.scooters.ScooterDocument {
  return {
    id: type,
    type,
    fileName: `${type}-original.pdf`,
    contentType: "application/pdf",
    byteSize: 8,
    contentUrl: `/original/${type}`,
    createdAt: "2026-01-01T00:00:00Z",
    validFrom: "2000-01-01",
    validUntil: "2099-01-01",
    clientCopy: {
      fileName: `${type}-client.pdf`,
      contentType: "application/pdf",
      byteSize: 8,
      contentUrl: `/client/${type}`,
    },
  };
}
function scooter(
  documents = [
    document("civ"),
    document("registration_certificate"),
    document("insurance"),
  ],
) {
  return {
    id: "scooter",
    fleetNumber: 7,
    brandCode: "HON",
    documents,
    missingClientDocuments: [],
  } as unknown as v1.scooters.Scooter;
}
function setup(value = scooter(), canRead = true) {
  return renderHook(() => useShareClientDocuments(value, canRead), { wrapper });
}
async function open(hook: ReturnType<typeof setup>) {
  act(() => hook.result.current.onMenuOpenChange(true));
  await waitFor(() => expect(hook.result.current.disabled).toBe(false));
}
beforeEach(() => {
  apiFetch.mockReset().mockResolvedValue({});
  download
    .mockReset()
    .mockImplementation(() => Promise.resolve(new Response("client pdf")));
  share.mockReset().mockResolvedValue(undefined);
  canShare.mockReset().mockReturnValue(true);
  vi.stubGlobal("fetch", download);
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    value: canShare,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (navigator as Partial<Navigator>).share;
  delete (navigator as Partial<Navigator>).canShare;
});

describe("sharing client documents", () => {
  it.each(
    [
      [],
      [document("civ")],
      [
        document("civ"),
        document("registration_certificate"),
        { ...document("insurance"), validUntil: "2001-01-01" },
      ],
    ].map((documents) => ({ documents })),
  )("disables missing or incomplete client copies", ({ documents }) => {
    const hook = setup(scooter(documents));
    act(() => hook.result.current.onMenuOpenChange(true));
    expect(hook.result.current.disabled).toBe(true);
    expect(hook.result.current.description).toBe("Missing documents");
    expect(download).not.toHaveBeenCalled();
  });
  it("respects the server's ITP requirements", () => {
    const hook = setup({ ...scooter(), missingClientDocuments: ["itp_card"] });
    expect(hook.result.current.description).toBe("Missing documents");
    expect(hook.result.current.disabled).toBe(true);
  });
  it("prepares only client files and invokes native sharing directly from the action", async () => {
    const hook = setup();
    await open(hook);
    expect(download.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.com/client/civ",
      "https://api.example.com/client/registration_certificate",
      "https://api.example.com/client/insurance",
    ]);
    expect(download).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
    act(() => hook.result.current.share());
    expect(share).toHaveBeenCalledOnce();
    const data = share.mock.calls[0]![0];
    expect(data.title).toBe("007 HON");
    expect(data.files.map((file: File) => file.name)).toEqual([
      "civ-client.pdf",
      "registration_certificate-client.pdf",
      "insurance-client.pdf",
    ]);
    await waitFor(() => expect(hook.result.current.disabled).toBe(false));
  });
  it("does not share a partial set after a failed download and retries on reopening", async () => {
    download.mockResolvedValueOnce(new Response("failed", { status: 403 }));
    const hook = setup();
    act(() => hook.result.current.onMenuOpenChange(true));
    await waitFor(() =>
      expect(hook.result.current.description).toContain("Could not prepare"),
    );
    act(() => hook.result.current.share());
    expect(share).not.toHaveBeenCalled();
    act(() => hook.result.current.onMenuOpenChange(false));
    await open(hook);
  });
  it("keeps the action disabled while files download", async () => {
    let resolve!: (response: Response) => void;
    download.mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const hook = setup();
    act(() => hook.result.current.onMenuOpenChange(true));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(3));
    expect(hook.result.current.description).toBe("Preparing documents…");
    act(() => hook.result.current.share());
    expect(share).not.toHaveBeenCalled();
    await act(async () => resolve(new Response("pdf")));
    await waitFor(() => expect(hook.result.current.disabled).toBe(false));
  });
  it("ignores cancellation and reports actual sharing failures", async () => {
    const hook = setup();
    await open(hook);
    share.mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"));
    act(() => hook.result.current.share());
    await waitFor(() => expect(hook.result.current.disabled).toBe(false));
    expect(hook.result.current.shareError).toBeNull();
    share.mockRejectedValueOnce(new Error("Failed"));
    act(() => hook.result.current.share());
    await waitFor(() =>
      expect(hook.result.current.shareError).toBe(
        messages.en.scooters.sharing.shareError,
      ),
    );
  });
  it("does not download files without read permission", () => {
    const hook = setup(scooter(), false);
    act(() => hook.result.current.onMenuOpenChange(true));
    expect(hook.result.current.disabled).toBe(true);
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it("explains when native file sharing is unsupported", async () => {
    canShare.mockReturnValue(false);
    const hook = setup();
    act(() => hook.result.current.onMenuOpenChange(true));
    await waitFor(() =>
      expect(hook.result.current.description).toBe(
        messages.en.scooters.sharing.unsupported,
      ),
    );
    expect(hook.result.current.disabled).toBe(true);
  });
});
