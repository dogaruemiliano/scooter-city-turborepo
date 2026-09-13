import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, v1 } from "@repo/api-shared";
import { createEmptyCreateForm, switchDocumentWorkflow } from "./form-state";
import {
  createExtractionState,
  invalidateDocumentExtraction,
  markExtractionFieldEdited,
  type ExtractionState,
} from "./extraction-state";
import { useDocumentExtraction } from "./useDocumentExtraction";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ webApi: api }));

function initial(): ExtractionState {
  const state = createExtractionState(createEmptyCreateForm("foreign"));
  state.form.documents[0]!.photos.front = {
    id: "front-1",
    status: "uploaded",
    file: new File(["synthetic"], "front.png", { type: "image/png" }),
    uploadToken: "private-token-1",
  };
  return state;
}
function resultFor(name: string): v1.persons.PersonDocumentExtraction {
  return {
    documentType: "passport",
    detectedDocumentType: "passport",
    sourceUploadIds: ["source"],
    reviewRequired: true,
    suggestions: [
      {
        target: "person",
        field: "firstName",
        value: name,
        sourceSlot: "front",
        needsReview: false,
      },
    ],
    licenseCategories: [],
    warnings: [],
  };
}

function deferred() {
  let resolve!: (value: v1.persons.PersonDocumentExtraction) => void;
  const promise = new Promise<v1.persons.PersonDocumentExtraction>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(state = initial()) {
  return renderHook(() => {
    const [current, setState] = useState(state);
    return {
      state: current,
      setState,
      ...useDocumentExtraction(current, setState),
    };
  });
}
beforeEach(() => {
  api.fetch.mockReset();
});

describe("automatic document reading", () => {
  it("does not repeat or abort ID extraction when only the selected format changes", async () => {
    const state = createExtractionState(createEmptyCreateForm("romanian"));
    state.form.documents[0]!.photos = initial().form.documents[0]!.photos;
    const request = deferred();
    api.fetch.mockReturnValue(request.promise);
    const { result } = setup(state);
    act(() =>
      result.current.setState((current) => ({
        ...current,
        form: switchDocumentWorkflow(current.form, "romanian", "electronic"),
      })),
    );
    expect(api.fetch).toHaveBeenCalledOnce();
    expect(api.fetch.mock.calls[0]![2].signal.aborted).toBe(false);
    await act(async () =>
      request.resolve({
        ...resultFor("Ana-Maria"),
        documentType: "nationalId",
        detectedDocumentType: "nationalId",
      }),
    );
    expect(result.current.state.form.firstName).toBe("Ana-Maria");
    act(() =>
      result.current.setState((current) => ({
        ...current,
        form: switchDocumentWorkflow(current.form, "romanian", "classic"),
      })),
    );
    expect(result.current.state.form.firstName).toBe("Ana-Maria");
    expect(result.current.pending).toBe(false);
    expect(api.fetch).toHaveBeenCalledOnce();
  });

  it("reuses saved extraction after remount and token renewal, preserving manual edits", async () => {
    api.fetch.mockResolvedValue(resultFor("Ana"));
    const first = setup();
    await waitFor(() => expect(first.result.current.pending).toBe(false));
    act(() =>
      first.result.current.setState((state) =>
        markExtractionFieldEdited(
          { ...state, form: { ...state.form, firstName: "Ana-Maria" } },
          "person.firstName",
        ),
      ),
    );
    const saved = first.result.current.state;
    first.unmount();
    api.fetch.mockClear();
    const document = saved.form.documents[0]!;
    const photo = document.photos.front!;
    const restored = setup({
      ...saved,
      form: {
        ...saved.form,
        documents: saved.form.documents.map((entry) =>
          entry.key === document.key
            ? {
                ...entry,
                photos: {
                  front: {
                    id: photo.id,
                    file: photo.file,
                    status: "uploading",
                  },
                },
              }
            : entry,
        ),
      },
    });
    expect(api.fetch).not.toHaveBeenCalled();
    act(() =>
      restored.result.current.setState({
        ...saved,
        form: {
          ...saved.form,
          documents: saved.form.documents.map((entry) =>
            entry.key === document.key
              ? {
                  ...entry,
                  photos: {
                    front: {
                      ...photo,
                      status: "uploaded",
                      uploadToken: "renewed-token",
                    },
                  },
                }
              : entry,
          ),
        },
      }),
    );
    expect(restored.result.current.pending).toBe(false);
    expect(restored.result.current.jobs[document.key]?.status).toBe("success");
    expect(restored.result.current.state.form.firstName).toBe("Ana-Maria");
    expect(api.fetch).not.toHaveBeenCalled();
    act(() => restored.result.current.retry(document.key));
    await waitFor(() => expect(api.fetch).toHaveBeenCalledOnce());
  });

  it("extracts changed photos after resuming instead of reusing stale readings", async () => {
    api.fetch.mockResolvedValue(resultFor("Ana"));
    const first = setup();
    await waitFor(() => expect(first.result.current.pending).toBe(false));
    const saved = first.result.current.state;
    first.unmount();
    api.fetch.mockClear();
    api.fetch.mockResolvedValue(resultFor("Maria"));
    const document = saved.form.documents[0]!;
    const restored = setup({
      ...saved,
      form: {
        ...saved.form,
        documents: saved.form.documents.map((entry) =>
          entry.key === document.key
            ? {
                ...entry,
                photos: { front: { ...entry.photos.front!, id: "new-photo" } },
              }
            : entry,
        ),
      },
    });
    await waitFor(() =>
      expect(restored.result.current.state.form.firstName).toBe("Maria"),
    );
    expect(api.fetch).toHaveBeenCalledOnce();
  });

  it("waits for upload completion and sends only current draft tokens", async () => {
    const state = initial();
    const photo = state.form.documents[0]!.photos.front!;
    state.form.documents[0]!.photos.front = {
      id: photo.id,
      file: photo.file,
      status: "uploading",
    };
    api.fetch.mockResolvedValue(resultFor("Ana"));
    const { result } = setup(state);
    expect(api.fetch).not.toHaveBeenCalled();
    act(() => result.current.setState(initial()));
    await waitFor(() =>
      expect(result.current.state.form.firstName).toBe("Ana"),
    );
    expect(api.fetch).toHaveBeenCalledWith(
      v1.persons.ROUTES.documents.extract,
      expect.anything(),
      expect.objectContaining({
        json: {
          documentType: "passport",
          photos: { front: "private-token-1" },
        },
      }),
    );
    expect(result.current.pending).toBe(false);
    expect(result.current.pendingDocumentKeys.size).toBe(0);
  });

  it("marks reading pending and preserves edits and intentional clears during the request", async () => {
    const request = deferred();
    api.fetch.mockReturnValue(request.promise);
    const { result } = setup();
    expect(result.current.pending).toBe(true);
    expect([...result.current.pendingDocumentKeys]).toEqual([
      "foreign-passport",
    ]);
    act(() =>
      result.current.setState((state) =>
        markExtractionFieldEdited(
          { ...state, form: { ...state.form, firstName: "" } },
          "person.firstName",
        ),
      ),
    );
    await act(async () => request.resolve(resultFor("Ana")));
    expect(result.current.state.form.firstName).toBe("");
    expect(
      result.current.state.fields["person.firstName"]?.suggestions[0]?.value,
    ).toBe("Ana");
  });

  it("aborts a replaced photo and ignores its late response", async () => {
    const old = deferred();
    const latest = deferred();
    api.fetch
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    const { result } = setup();
    const signal = api.fetch.mock.calls[0]![2].signal as AbortSignal;
    act(() => {
      result.current.cancelDocument("foreign-passport");
      result.current.setState((state) => {
        const next = invalidateDocumentExtraction(state, "foreign-passport");
        return {
          ...next,
          form: {
            ...next.form,
            documents: next.form.documents.map((document) =>
              document.key === "foreign-passport"
                ? {
                    ...document,
                    photos: {
                      front: {
                        ...initial().form.documents[0]!.photos.front!,
                        id: "front-2",
                        status: "uploaded",
                        uploadToken: "private-token-2",
                      },
                    },
                  }
                : document,
            ),
          },
        };
      });
    });
    expect(signal.aborted).toBe(true);
    await act(async () => latest.resolve(resultFor("New")));
    await act(async () => old.resolve(resultFor("Old")));
    expect(result.current.state.form.firstName).toBe("New");
  });

  it("reads both sides together when another uploaded side is added", async () => {
    const old = deferred();
    api.fetch
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(resultFor("Combined"));
    const { result } = setup();
    act(() =>
      result.current.setState((state) => ({
        ...state,
        form: {
          ...state.form,
          documents: state.form.documents.map((document) =>
            document.key === "foreign-passport"
              ? {
                  ...document,
                  photos: {
                    ...document.photos,
                    back: {
                      id: "back",
                      status: "uploaded",
                      uploadToken: "back-token",
                      file: new File(["synthetic"], "back.png", {
                        type: "image/png",
                      }),
                    },
                  },
                }
              : document,
          ),
        },
      })),
    );
    await waitFor(() =>
      expect(result.current.state.form.firstName).toBe("Combined"),
    );
    expect(api.fetch.mock.calls[1]![2].json.photos).toEqual({
      front: "private-token-1",
      back: "back-token",
    });
    await act(async () => old.resolve(resultFor("Old front")));
    expect(result.current.state.form.firstName).toBe("Combined");
  });

  it("ignores a result after changing citizenship", async () => {
    const request = deferred();
    api.fetch.mockReturnValue(request.promise);
    const { result } = setup();
    act(() => {
      result.current.cancelDocument("foreign-passport");
      result.current.setState((state) => ({
        ...state,
        form: switchDocumentWorkflow(state.form, "romanian"),
      }));
    });
    await act(async () => request.resolve(resultFor("Hidden passport")));
    expect(result.current.state.form.firstName).toBe("");
    expect(result.current.pending).toBe(false);
  });

  it("aborts a superseded same-photo retry and ignores its late result", async () => {
    const old = deferred();
    const latest = deferred();
    api.fetch
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    const { result } = setup();
    const originalSignal = api.fetch.mock.calls[0]![2].signal;
    act(() => result.current.retry("foreign-passport"));
    expect(originalSignal.aborted).toBe(true);
    expect(result.current.pending).toBe(true);
    expect([...result.current.pendingDocumentKeys]).toEqual([
      "foreign-passport",
    ]);
    await act(async () => latest.resolve(resultFor("Retry")));
    await act(async () => old.resolve(resultFor("Ignored")));
    expect(result.current.state.form.firstName).toBe("Retry");
  });

  it("omits a contradictory mismatch warning from new and restored matching readings", async () => {
    api.fetch.mockResolvedValue({
      ...resultFor("Ana"),
      warnings: ["typeMismatch", "unclearText"],
    });
    const first = setup();
    await waitFor(() => expect(first.result.current.pending).toBe(false));
    expect(first.result.current.jobs["foreign-passport"]?.warnings).toEqual([
      "unclearText",
    ]);
    const saved = first.result.current.state;
    first.unmount();
    api.fetch.mockClear();
    const restored = setup(saved);
    expect(restored.result.current.jobs["foreign-passport"]?.warnings).toEqual([
      "unclearText",
    ]);
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("keeps a genuine mismatch warning visible", async () => {
    api.fetch.mockResolvedValue({
      ...resultFor("Ana"),
      detectedDocumentType: "nationalId",
      warnings: ["typeMismatch"],
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.jobs["foreign-passport"]?.warnings).toEqual([
      "typeMismatch",
    ]);
  });

  it("makes disabled extraction nonblocking without automatic retries", async () => {
    api.fetch.mockRejectedValue(
      new ApiError(503, "Disabled", "DOCUMENT_EXTRACTION_DISABLED"),
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.jobs["foreign-passport"]?.status).toBe("disabled");
    expect(result.current.pendingDocumentKeys.size).toBe(0);
    act(() =>
      result.current.setState((state) => ({
        ...state,
        form: { ...state.form, firstName: "Manual" },
      })),
    );
    expect(api.fetch).toHaveBeenCalledTimes(1);
  });

  it("stops field loading on an error and resumes only on explicit retry", async () => {
    api.fetch.mockRejectedValueOnce(new Error("Unavailable"));
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.jobs["foreign-passport"]?.status).toBe("error"),
    );
    expect(result.current.pendingDocumentKeys.size).toBe(0);
    const retry = deferred();
    api.fetch.mockReturnValueOnce(retry.promise);
    act(() => result.current.retry("foreign-passport"));
    expect([...result.current.pendingDocumentKeys]).toEqual([
      "foreign-passport",
    ]);
    await act(async () => retry.resolve(resultFor("Ana")));
    expect(result.current.pendingDocumentKeys.size).toBe(0);
  });
});
