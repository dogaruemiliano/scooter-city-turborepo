import { ApiError, v1 } from "@repo/api-shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useScooterDocumentAnalysis } from "./useScooterDocumentAnalysis";
import type {
  ScooterDocumentsEditor,
  DocumentDraft,
} from "./useScooterDocuments";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: async (...args: unknown[]) => {
      const result = await apiFetch(...args);
      return result?.extractedData
        ? {
            id: `job-${result.sourceId}`,
            sourceId: result.sourceId,
            documentType: result.documentType,
            status: "completed",
            result,
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          }
        : result;
    },
  },
}));
function draft(id: string, type: DocumentDraft["type"] = "civ"): DocumentDraft {
  return {
    id,
    type,
    file: new File([id], `${id}.pdf`, { type: "application/pdf" }),
    status: "ready",
    uploadToken: `token-${id}`,
  };
}
function documents(drafts: DocumentDraft[]) {
  return {
    drafts,
    existing: [],
    ensureSession: async () => "session",
    handleSessionError: vi.fn(),
  } as unknown as ScooterDocumentsEditor;
}
function response(
  sourceId: string,
  documentType: v1.scooters.ScooterDocumentType = "civ",
): v1.scooters.ScooterDocumentAnalysis {
  return {
    sourceId,
    documentType,
    extractedData: { vin: "LXYTCKP05P0000001", fields: {}, rawFields: {} },
    issues: [],
    reviewRequired: true,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  access.user = { isSuperAdmin: true, effectiveScopes: {} };
  apiFetch.mockReset();
});

describe("direct document analysis", () => {
  it("reuses manual corrections without another request and discards them with the source", async () => {
    apiFetch.mockResolvedValueOnce(response("one"));
    const file = draft("one");
    const hook = renderHook(
      ({ files }) => useScooterDocumentAnalysis(documents(files)),
      { initialProps: { files: [file] } },
    );
    await act(async () => {
      await hook.result.current.run();
    });
    const vin = "LXYTCKP05P0000002";
    act(() => {
      expect(
        hook.result.current.reviewVins([
          {
            sourceId: "one",
            previousVin: response("one").extractedData.vin,
            vin,
          },
        ]),
      ).not.toBeNull();
    });
    await act(async () => {
      const cached = await hook.result.current.run();
      expect(cached?.[0]).toMatchObject({
        status: "success",
        analysis: {
          extractedData: {
            vin,
            vinReview: {
              method: "manual",
              originalVin: response("one").extractedData.vin,
            },
          },
        },
      });
    });
    expect(apiFetch).toHaveBeenCalledOnce();
    act(() => {
      expect(
        hook.result.current.reviewVins([
          {
            sourceId: "one",
            previousVin: response("one").extractedData.vin,
            vin,
          },
        ]),
      ).toBeNull();
    });
    hook.rerender({ files: [] });
    expect(hook.result.current.entries).toEqual({});
    act(() => {
      expect(
        hook.result.current.reviewVins([
          { sourceId: "one", previousVin: vin, vin },
        ]),
      ).toBeNull();
    });
    hook.rerender({ files: [file] });
    expect(hook.result.current.entries).toEqual({});
  });

  it("rejects an invalid review batch atomically", async () => {
    apiFetch.mockImplementation((_route, _schema, { json }) =>
      Promise.resolve(response(json.sourceId)),
    );
    const files = [draft("one"), draft("two")];
    const hook = renderHook(() => useScooterDocumentAnalysis(documents(files)));
    await act(async () => {
      await hook.result.current.run();
    });
    const before = hook.result.current.entries;
    act(() => {
      expect(
        hook.result.current.reviewVins([
          {
            sourceId: "one",
            previousVin: response("one").extractedData.vin,
            vin: "LXYTCKP05P0000002",
          },
          {
            sourceId: "two",
            previousVin: response("two").extractedData.vin,
            vin: "bad",
          },
        ]),
      ).toBeNull();
    });
    expect(hook.result.current.entries).toBe(before);
  });
  it.each([
    ["DOCUMENT_EXTRACTION_FAILED", 502, "failed"],
    ["DOCUMENT_EXTRACTION_BAD_DOCUMENT", 400, "unsupported"],
    ["DOCUMENT_EXTRACTION_UNSUPPORTED_DOCUMENT", 400, "unsupported"],
    ["DOCUMENT_EDITOR_SESSION_UNAVAILABLE", 400, "sessionExpired"],
  ] as const)(
    "maps %s to the appropriate insurance error message",
    async (code, status, error) => {
      apiFetch.mockRejectedValueOnce(
        new ApiError(status, "Extraction failed", code),
      );
      const editor = documents([draft("insurance", "insurance")]);
      const hook = renderHook(() => useScooterDocumentAnalysis(editor));
      await act(async () => {
        await hook.result.current.run();
      });
      expect(hook.result.current.entries.insurance).toEqual({
        status: "failed",
        error,
      });
    },
  );

  it.each([false, true])(
    "skips all import attachments when a CIV exists (saved CIV: %s)",
    async (saved) => {
      const civ = draft("civ");
      const attached = [
        draft("import-one", "import_document"),
        draft("import-two", "import_document"),
        draft("registration", "registration_certificate"),
        draft("insurance", "insurance"),
      ];
      const editor = documents(saved ? attached : [...attached, civ]);
      if (saved)
        editor.existing = [
          {
            id: civ.id,
            type: civ.type,
            fileName: civ.file.name,
            byteSize: civ.file.size,
          },
        ] as v1.scooters.ScooterDocument[];
      apiFetch.mockImplementation((_route, _schema, { json }) =>
        Promise.resolve(
          response(
            json.sourceId,
            json.source.kind === "saved" ? "civ" : json.source.type,
          ),
        ),
      );
      const hook = renderHook(() =>
        useScooterDocumentAnalysis(editor, saved ? "scooter" : undefined),
      );
      await act(async () => {
        await hook.result.current.run();
      });
      expect(apiFetch).toHaveBeenCalledTimes(3);
      expect(
        apiFetch.mock.calls
          .map(([, , options]) => options.json.sourceId)
          .sort(),
      ).toEqual(["civ", "insurance", "registration"]);
      expect(hook.result.current.entries).not.toHaveProperty("import-one");
      expect(hook.result.current.entries).not.toHaveProperty("import-two");
    },
  );

  it("analyzes every import attachment when the CIV is removed", async () => {
    const civ = draft("civ");
    const imports = [
      draft("import-one", "import_document"),
      draft("import-two", "import_document"),
    ];
    apiFetch.mockImplementation((_route, _schema, { json }) =>
      Promise.resolve(response(json.sourceId, json.source.type)),
    );
    const hook = renderHook(
      ({ files }) => useScooterDocumentAnalysis(documents(files)),
      { initialProps: { files: [...imports, civ] } },
    );
    await act(async () => {
      await hook.result.current.run();
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    hook.rerender({ files: imports });
    await act(async () => {
      await hook.result.current.run();
    });
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(Object.keys(hook.result.current.entries).sort()).toEqual([
      "import-one",
      "import-two",
    ]);
  });

  it("cancels a running import and discards its late response when CIV is added", async () => {
    const request = deferred<v1.scooters.ScooterDocumentAnalysis>();
    const importer = draft("import", "import_document");
    apiFetch.mockReturnValueOnce(request.promise);
    const hook = renderHook(
      ({ files }) => useScooterDocumentAnalysis(documents(files)),
      { initialProps: { files: [importer] } },
    );
    let run!: ReturnType<typeof hook.result.current.run>;
    await act(async () => {
      run = hook.result.current.run();
    });
    const signal = apiFetch.mock.calls[0]![2].signal as AbortSignal;
    hook.rerender({ files: [importer, draft("civ")] });
    expect(signal.aborted).toBe(false); // The start POST can still reveal a job to cancel.
    await act(async () => {
      request.resolve(response("import", "import_document"));
      expect(await run).toBeNull();
    });
    expect(hook.result.current.entries).toEqual({});
    apiFetch.mockResolvedValueOnce(response("civ"));
    await act(async () => {
      await hook.result.current.run();
    });
    expect(hook.result.current.entries.civ?.status).toBe("success");
    expect(hook.result.current.entries).not.toHaveProperty("import");
  });

  it("rejects a response associated with the wrong document type", async () => {
    apiFetch.mockResolvedValueOnce({
      ...response("one"),
      documentType: "insurance",
    });
    const attached = [draft("one")];
    const hook = renderHook(() =>
      useScooterDocumentAnalysis(documents(attached)),
    );
    await act(async () => {
      await hook.result.current.run();
    });
    expect(hook.result.current.entries.one).toEqual({
      status: "failed",
      error: "failed",
    });
  });
  it("runs only two requests concurrently and reuses successes when returning to documents", async () => {
    const attached = [draft("one"), draft("two"), draft("three")];
    const requests = attached.map(() =>
      deferred<v1.scooters.ScooterDocumentAnalysis>(),
    );
    requests.forEach((request) =>
      apiFetch.mockReturnValueOnce(request.promise),
    );
    const hook = renderHook(() =>
      useScooterDocumentAnalysis(documents(attached)),
    );
    let run!: ReturnType<typeof hook.result.current.run>;
    await act(async () => {
      run = hook.result.current.run();
    });
    expect(apiFetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      requests[0]!.resolve(response("one"));
    });
    expect(apiFetch).toHaveBeenCalledTimes(3);
    await act(async () => {
      requests[1]!.resolve(response("two"));
      requests[2]!.resolve(response("three"));
      await run;
    });
    expect(hook.result.current.running).toBe(false);
    await act(async () => {
      await hook.result.current.run();
    });
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(
      Object.values(hook.result.current.entries).every(
        (entry) => entry.status === "success",
      ),
    ).toBe(true);
  });

  it("retries only failed documents and handles rate-limit errors specifically", async () => {
    apiFetch
      .mockResolvedValueOnce(response("one"))
      .mockRejectedValueOnce(
        new ApiError(429, "limited", "DOCUMENT_EXTRACTION_THROTTLED"),
      );
    const attached = [draft("one"), draft("two")];
    const hook = renderHook(() =>
      useScooterDocumentAnalysis(documents(attached)),
    );
    await act(async () => {
      await hook.result.current.run();
    });
    expect(hook.result.current.entries.two).toEqual({
      status: "failed",
      error: "throttled",
    });
    apiFetch.mockResolvedValueOnce(response("two"));
    await act(async () => {
      await hook.result.current.run();
    });
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(apiFetch.mock.calls[2]![2].json.sourceId).toBe("two");
  });

  it("ignores a removed document's late response even when the transport does not abort", async () => {
    const request = deferred<v1.scooters.ScooterDocumentAnalysis>();
    apiFetch.mockReturnValueOnce(request.promise);
    const original = draft("one");
    const hook = renderHook(
      ({ files }) => useScooterDocumentAnalysis(documents(files)),
      { initialProps: { files: [original] } },
    );
    let run!: ReturnType<typeof hook.result.current.run>;
    await act(async () => {
      run = hook.result.current.run();
    });
    const signal = apiFetch.mock.calls[0]![2].signal as AbortSignal;
    hook.rerender({ files: [] });
    expect(signal.aborted).toBe(false); // The start POST can still reveal a job to cancel.
    await act(async () => {
      request.resolve(response("one"));
      expect(await run).toBeNull();
    });
    expect(hook.result.current.entries).toEqual({});
  });

  it("does not re-extract when only an upload token renews, but re-extracts replacement bytes", async () => {
    apiFetch.mockResolvedValue(response("one"));
    const original = draft("one");
    const hook = renderHook(
      ({ file }) => useScooterDocumentAnalysis(documents([file])),
      { initialProps: { file: original } },
    );
    await act(async () => {
      await hook.result.current.run();
    });
    hook.rerender({ file: { ...original, uploadToken: "renewed" } });
    await act(async () => {
      await hook.result.current.run();
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    hook.rerender({
      file: {
        ...original,
        file: new File(["changed bytes"], original.file.name, {
          type: "application/pdf",
        }),
      },
    });
    await act(async () => {
      await hook.result.current.run();
    });
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("keeps in-flight work when another file is added", async () => {
    const pending = deferred<v1.scooters.ScooterDocumentAnalysis>();
    apiFetch.mockReturnValueOnce(pending.promise);
    const first = draft("first");
    const hook = renderHook(
      ({ files }) => useScooterDocumentAnalysis(documents(files)),
      { initialProps: { files: [first] } },
    );
    let run!: ReturnType<typeof hook.result.current.run>;
    await act(async () => {
      run = hook.result.current.run({ automatic: true });
    });
    hook.rerender({ files: [first, draft("second")] });
    await act(async () => {
      pending.resolve(response("first"));
      await run;
    });
    expect(hook.result.current.entries.first?.status).toBe("success");
    apiFetch.mockResolvedValueOnce(response("second"));
    await act(async () => {
      await hook.result.current.run({ automatic: true });
    });
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(hook.result.current.entries.second?.status).toBe("success");
  });

  it("cancels queued files as well as active files without automatic restart", async () => {
    const pending = deferred<v1.scooters.ScooterDocumentAnalysis>();
    apiFetch.mockReturnValue(pending.promise);
    const hook = renderHook(() =>
      useScooterDocumentAnalysis(
        documents([draft("one"), draft("two"), draft("three")]),
      ),
    );
    let run!: ReturnType<typeof hook.result.current.run>;
    await act(async () => {
      run = hook.result.current.run({ automatic: true });
    });
    await act(async () => {
      hook.result.current.cancel();
      await run;
    });
    expect(hook.result.current.entries.three).toEqual({
      status: "failed",
      error: "cancelled",
    });
    const calls = apiFetch.mock.calls.length;
    await act(async () => {
      await hook.result.current.run({ automatic: true });
    });
    expect(apiFetch).toHaveBeenCalledTimes(calls);
    expect(hook.result.current.running).toBe(false);
  });

  it("prevents duplicate runs and aborts on unmount", async () => {
    const request = deferred<v1.scooters.ScooterDocumentAnalysis>();
    apiFetch.mockReturnValue(request.promise);
    const attached = [draft("one")];
    const hook = renderHook(() =>
      useScooterDocumentAnalysis(documents(attached)),
    );
    await act(async () => {
      void hook.result.current.run();
      void hook.result.current.run();
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    hook.unmount();
    expect(apiFetch.mock.calls[0]![2].signal.aborted).toBe(false);
    request.resolve(response("one"));
  });

  it("waits for uploads and reads the latest token when upload completes", async () => {
    const original = draft("one");
    const hook = renderHook(
      ({ file }) => useScooterDocumentAnalysis(documents([file])),
      {
        initialProps: {
          file: {
            ...original,
            status: "uploading" as DocumentDraft["status"],
            uploadToken: undefined as string | undefined,
          },
        },
      },
    );
    await act(async () => {
      await hook.result.current.run();
    });
    expect(apiFetch).not.toHaveBeenCalled();
    apiFetch.mockResolvedValueOnce(response("one"));
    hook.rerender({ file: { ...original, uploadToken: original.uploadToken } });
    await act(async () => {
      await hook.result.current.run();
    });
    await waitFor(() =>
      expect(hook.result.current.entries.one?.status).toBe("success"),
    );
    expect(apiFetch.mock.calls[0]![2].json.source.uploadToken).toBe(
      original.uploadToken,
    );
  });
});

const access = vi.hoisted(() => ({
  user: { isSuperAdmin: true, effectiveScopes: {} as Record<string, string[]> },
}));
vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => access,
}));

it("does not request extraction without the extraction capability", async () => {
  access.user = {
    isSuperAdmin: false,
    effectiveScopes: { "scooter_documents.write": ["ALL"] },
  };
  const hook = renderHook(() =>
    useScooterDocumentAnalysis(documents([draft("one")])),
  );
  await act(async () => {
    expect(await hook.result.current.run()).toBeNull();
  });
  expect(apiFetch).not.toHaveBeenCalled();
  expect(hook.result.current.running).toBe(false);
});
