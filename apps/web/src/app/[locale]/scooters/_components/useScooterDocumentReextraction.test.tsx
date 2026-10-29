import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v1 } from "@repo/api-shared";
import { useScooterDocumentReextraction } from "./useScooterDocumentReextraction";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";

const runner = vi.hoisted(() => vi.fn());
const cancelAttempt = vi.hoisted(() => vi.fn());
vi.mock("./scooter-document-analysis-job", () => ({
  createDocumentAnalysisAttempt: (input: unknown) => ({ input }),
  runDocumentAnalysisAttempt: runner,
  cancelDocumentAnalysisAttempt: cancelAttempt,
}));
const response = (sourceId: string) => ({
  sourceId,
  documentType: "civ",
  extractedData: { vin: null, fields: {}, rawFields: {} },
  issues: [],
  reviewRequired: true,
});
function documents() {
  return {
    existing: ["a", "b"].map((id) => ({
      id,
      type: "civ",
      extractedData: { vin: null, fields: {}, rawFields: {} },
    })),
    drafts: [],
    ensureSession: vi.fn(async () => "session"),
    handleSessionError: vi.fn(),
    setExtractions: vi.fn(),
  } as unknown as ScooterDocumentsEditor;
}
beforeEach(() => {
  runner.mockReset();
  cancelAttempt.mockReset();
});

describe("explicit saved-document analysis", () => {
  it("never runs on mount, uses existing saved files, and does not mutate document evidence", async () => {
    const editor = documents();
    runner.mockImplementation(async (attempt) =>
      response(attempt.input.sourceId),
    );
    const { result } = renderHook(() =>
      useScooterDocumentReextraction(editor, "scooter"),
    );
    expect(runner).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.run();
    });
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner.mock.calls[0]![0].input).toMatchObject({
      source: { kind: "saved", scooterId: "scooter", documentId: "a" },
    });
    expect(editor.setExtractions).not.toHaveBeenCalled();
    expect(
      Object.values(result.current.entries).every(
        (entry) => entry.status === "success",
      ),
    ).toBe(true);
    const firstAttempt = runner.mock.calls[0]![0].input.attemptId;
    await act(async () => {
      await result.current.run();
    });
    expect(runner.mock.calls[2]![0].input.attemptId).not.toBe(firstAttempt);
  });
  it("retains partial successes and retries only failed documents", async () => {
    runner.mockImplementation(async (attempt) => {
      if (attempt.input.sourceId === "b") throw new Error("unavailable");
      return response(attempt.input.sourceId);
    });
    const { result } = renderHook(() =>
      useScooterDocumentReextraction(documents(), "scooter"),
    );
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.entries.a?.status).toBe("success");
    expect(result.current.entries.b?.status).toBe("failed");
    runner.mockImplementation(async (attempt) =>
      response(attempt.input.sourceId),
    );
    await act(async () => {
      await result.current.run(["b"]);
    });
    expect(runner).toHaveBeenCalledTimes(3);
    expect(runner.mock.calls[2]![0].input.sourceId).toBe("b");
    expect(result.current.entries.a?.status).toBe("success");
  });
  it("blocks duplicate runs, cancels jobs and ignores late results", async () => {
    let finish!: (value: unknown) => void;
    runner.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const editor = {
      ...documents(),
      existing: documents().existing.slice(0, 1),
    };
    const { result } = renderHook(() =>
      useScooterDocumentReextraction(editor, "scooter"),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.run();
    });
    await act(async () => {
      await result.current.run();
    });
    expect(runner).toHaveBeenCalledTimes(1);
    act(() => result.current.cancel());
    expect(cancelAttempt).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(response("a"));
      await pending;
    });
    expect(result.current.entries).toEqual({});
    expect(editor.setExtractions).not.toHaveBeenCalled();
  });
  it("skips protective client copies and cancels outstanding work on unmount", async () => {
    runner.mockImplementation(() => new Promise(() => {}));
    const editor = documents();
    editor.existing[1]!.extractedData = {
      vin: null,
      fields: {},
      rawFields: {},
      clientCopy: true,
    } satisfies v1.scooters.ScooterDocumentExtractedData;
    const { result, unmount } = renderHook(() =>
      useScooterDocumentReextraction(editor, "scooter"),
    );
    await act(async () => {
      void result.current.run();
    });
    expect(runner).toHaveBeenCalledTimes(1);
    unmount();
    expect(cancelAttempt).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0]![2].aborted).toBe(true);
  });
});
