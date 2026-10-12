import { ApiError, v1 } from "@repo/api-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelDocumentAnalysisAttempt,
  createDocumentAnalysisAttempt,
  runDocumentAnalysisAttempt,
} from "./scooter-document-analysis-job";

const fetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ webApi: { fetch } }));
const routes = v1.scooters.ROUTES.documents;
function attempt() {
  return createDocumentAnalysisAttempt({
    sourceId: "source",
    sessionId: "session",
    attemptId: "attempt",
    source: { kind: "draft", type: "civ", uploadToken: "token" },
  });
}
function job(
  status: v1.scooters.ScooterDocumentExtractionJob["status"] = "queued",
): v1.scooters.ScooterDocumentExtractionJob {
  return {
    id: "job",
    sourceId: "source",
    documentType: "civ",
    status,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    ...(status === "completed"
      ? {
          result: {
            sourceId: "source",
            documentType: "civ",
            reviewRequired: true,
            extractedData: { vin: null, fields: {}, rawFields: {} },
            issues: [],
          } as const,
        }
      : {}),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => {
  fetch.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("background document jobs", () => {
  it("polls queued, preparing and running states and returns normalized evidence", async () => {
    fetch
      .mockResolvedValueOnce(job())
      .mockResolvedValueOnce(job("validating"))
      .mockResolvedValueOnce(job("running"))
      .mockResolvedValueOnce(job("completed"));
    const progress = vi.fn();
    const run = runDocumentAnalysisAttempt(
      attempt(),
      "civ",
      new AbortController().signal,
      progress,
    );
    await vi.runAllTimersAsync();
    expect(await run).toEqual(job("completed").result);
    expect(progress.mock.calls.flat()).toEqual([
      "queued",
      "validating",
      "running",
    ]);
    expect(fetch.mock.calls.map(([route]) => route)).toEqual([
      routes.startExtractionJob,
      routes.extractionJob("job"),
      routes.extractionJob("job"),
      routes.extractionJob("job"),
    ]);
  });

  it("resumes a known job after transport retries are exhausted without another start", async () => {
    fetch
      .mockResolvedValueOnce(job())
      .mockRejectedValue(new TypeError("offline"));
    const active = attempt();
    const failed = expect(
      runDocumentAnalysisAttempt(
        active,
        "civ",
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow("offline");
    await vi.runAllTimersAsync();
    await failed;
    fetch.mockResolvedValueOnce(job("completed"));
    expect(
      await runDocumentAnalysisAttempt(
        active,
        "civ",
        new AbortController().signal,
        vi.fn(),
      ),
    ).toEqual(job("completed").result);
    expect(
      fetch.mock.calls.filter(([route]) => route === routes.startExtractionJob),
    ).toHaveLength(1);
  });

  it("uses the same attempt identity when the start response is lost", async () => {
    fetch
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce(job("completed"));
    const active = attempt();
    const run = runDocumentAnalysisAttempt(
      active,
      "civ",
      new AbortController().signal,
      vi.fn(),
    );
    await vi.runAllTimersAsync();
    await run;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      fetch.mock.calls.map(([, , options]) => options.json.attemptId),
    ).toEqual(["attempt", "attempt"]);
  });

  it("stops polling immediately and cancels a job learned after local cancellation", async () => {
    const start = deferred<v1.scooters.ScooterDocumentExtractionJob>();
    fetch
      .mockReturnValueOnce(start.promise)
      .mockResolvedValue(job("cancelled"));
    const active = attempt();
    const controller = new AbortController();
    const run = runDocumentAnalysisAttempt(
      active,
      "civ",
      controller.signal,
      vi.fn(),
    );
    const rejected = expect(run).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    cancelDocumentAnalysisAttempt(active);
    await rejected;
    start.resolve(job("running"));
    await Promise.resolve();
    await Promise.resolve();
    expect(fetch.mock.calls[1]?.[0]).toBe(routes.cancelExtractionJob("job"));
    expect(fetch.mock.calls[1]?.[2].signal.aborted).toBe(false);
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("aborts pending poll timers without issuing another status request", async () => {
    fetch.mockResolvedValue(job("running"));
    const active = attempt();
    const controller = new AbortController();
    const run = runDocumentAnalysisAttempt(
      active,
      "civ",
      controller.signal,
      vi.fn(),
    );
    const rejected = expect(run).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    cancelDocumentAnalysisAttempt(active);
    await rejected;
    await vi.runAllTimersAsync();
    expect(fetch.mock.calls.map(([route]) => route)).toEqual([
      routes.startExtractionJob,
      routes.cancelExtractionJob("job"),
    ]);
  });

  it("does not replace an ambiguous provider submission with a new paid attempt", async () => {
    fetch
      .mockResolvedValueOnce(job("submission_unknown"))
      .mockResolvedValueOnce(job("completed"));
    const run = runDocumentAnalysisAttempt(
      attempt(),
      "civ",
      new AbortController().signal,
      vi.fn(),
    );
    await vi.runAllTimersAsync();
    await run;
    expect(
      fetch.mock.calls.filter(([route]) => route === routes.startExtractionJob),
    ).toHaveLength(1);
  });

  it("retains the attempt on deadline expiry so a retry must observe its real terminal state", async () => {
    fetch.mockResolvedValue({
      ...job("running"),
      expiresAt: new Date(Date.now() - 1).toISOString(),
    });
    const active = attempt();
    await expect(
      runDocumentAnalysisAttempt(
        active,
        "civ",
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_TIMEOUT" });
    expect(active.terminal).toBe(false);
    fetch.mockResolvedValue(job("expired"));
    await expect(
      runDocumentAnalysisAttempt(
        active,
        "civ",
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_TIMEOUT" });
    expect(active.terminal).toBe(true);
    expect(fetch.mock.calls[1]?.[0]).toBe(routes.extractionJob("job"));
  });

  it("rejects mismatched sources and preserves application errors", async () => {
    fetch.mockResolvedValue({ ...job("completed"), sourceId: "other" });
    await expect(
      runDocumentAnalysisAttempt(
        attempt(),
        "civ",
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_FAILED" });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockRejectedValue(
      new ApiError(429, "limited", "DOCUMENT_EXTRACTION_THROTTLED"),
    );
    await expect(
      runDocumentAnalysisAttempt(
        attempt(),
        "civ",
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_THROTTLED" });
  });
});
