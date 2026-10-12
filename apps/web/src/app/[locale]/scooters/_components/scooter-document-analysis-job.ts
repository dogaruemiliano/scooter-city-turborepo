import { ApiError, v1 } from "@repo/api-shared";
import { webApi } from "@/lib/api";

const HTTP_TIMEOUT_MS = 20_000;
const JOB_TIMEOUT_MS = 5 * 60_000;
const POLL_MIN_MS = 1_000;
const POLL_MAX_MS = 5_000;
const MAX_TRANSIENT_FAILURES = 3;

export interface DocumentAnalysisAttempt {
  input: v1.scooters.StartScooterDocumentExtractionJobInput;
  job?: v1.scooters.ScooterDocumentExtractionJob;
  start?: Promise<v1.scooters.ScooterDocumentExtractionJob>;
  cancelled: boolean;
  terminal: boolean;
  deadline: number;
}

export function createDocumentAnalysisAttempt(
  input: v1.scooters.StartScooterDocumentExtractionJobInput,
): DocumentAnalysisAttempt {
  return {
    input,
    cancelled: false,
    terminal: false,
    deadline: Date.now() + JOB_TIMEOUT_MS,
  };
}

export function cancelDocumentAnalysisAttempt(
  attempt: DocumentAnalysisAttempt,
) {
  if (attempt.cancelled || attempt.terminal) return;
  attempt.cancelled = true;
  cancelKnownJob(attempt);
}

function cancelKnownJob(attempt: DocumentAnalysisAttempt) {
  if (!attempt.job) return;
  void webApi
    .fetch(
      v1.scooters.ROUTES.documents.cancelExtractionJob(attempt.job.id),
      v1.scooters.scooterDocumentExtractionJobSchema,
      {
        method: "POST",
        keepalive: true,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      },
    )
    .catch(() => undefined);
}

function aborted() {
  return new DOMException("Document analysis was cancelled", "AbortError");
}

/** The independent POST can still return its job ID after local cancellation. */
function awaitWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => undefined);
    return Promise.reject(aborted());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(aborted());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function wait(ms: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function transient(error: unknown) {
  if (
    error instanceof ApiError &&
    error.code?.startsWith("DOCUMENT_EXTRACTION_")
  )
    return false;
  return (
    !(error instanceof ApiError) ||
    error.status === 408 ||
    error.status === 429 ||
    error.status >= 500
  );
}

function verifySource(
  attempt: DocumentAnalysisAttempt,
  job: v1.scooters.ScooterDocumentExtractionJob,
  documentType: v1.scooters.ScooterDocumentType,
) {
  if (
    job.sourceId !== attempt.input.sourceId ||
    job.documentType !== documentType ||
    (attempt.job && job.id !== attempt.job.id)
  )
    throw new ApiError(
      502,
      "Unexpected document source",
      "DOCUMENT_EXTRACTION_FAILED",
    );
}

/** Transport failures retain the attempt so Retry resumes the same paid work. */
export async function runDocumentAnalysisAttempt(
  attempt: DocumentAnalysisAttempt,
  documentType: v1.scooters.ScooterDocumentType,
  signal: AbortSignal,
  onProgress: (
    status: v1.scooters.ScooterDocumentExtractionJob["status"],
  ) => void,
) {
  let failures = 0;
  let poll = 0;
  // Always refresh known jobs when resuming after a disconnected browser request.
  let retrieve = Boolean(attempt.job);
  while (!signal.aborted && !attempt.cancelled) {
    try {
      let job: v1.scooters.ScooterDocumentExtractionJob;
      if (retrieve && attempt.job) {
        job = await webApi.fetch(
          v1.scooters.ROUTES.documents.extractionJob(attempt.job.id),
          v1.scooters.scooterDocumentExtractionJobSchema,
          {
            signal: AbortSignal.any([
              signal,
              AbortSignal.timeout(HTTP_TIMEOUT_MS),
            ]),
            cache: "no-store",
          },
        );
      } else {
        attempt.start ??= webApi
          .fetch(
            v1.scooters.ROUTES.documents.startExtractionJob,
            v1.scooters.scooterDocumentExtractionJobSchema,
            {
              method: "POST",
              json: attempt.input,
              signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
            },
          )
          .then((created) => {
            verifySource(attempt, created, documentType);
            attempt.job = created;
            if (attempt.cancelled) cancelKnownJob(attempt);
            return created;
          })
          .finally(() => {
            attempt.start = undefined;
          });
        job = await awaitWithAbort(attempt.start, signal);
      }
      if (signal.aborted || attempt.cancelled) throw aborted();
      verifySource(attempt, job, documentType);
      attempt.job = job;
      attempt.deadline = Math.min(attempt.deadline, Date.parse(job.expiresAt));
      failures = 0;
      if (job.status === "completed") {
        attempt.terminal = true;
        const result = job.result;
        if (
          !result ||
          result.sourceId !== attempt.input.sourceId ||
          result.documentType !== documentType
        )
          throw new ApiError(
            502,
            "Unexpected analysis result",
            "DOCUMENT_EXTRACTION_FAILED",
          );
        return result;
      }
      if (["failed", "cancelled", "expired"].includes(job.status)) {
        attempt.terminal = true;
        throw new ApiError(
          422,
          "Document analysis did not complete",
          job.errorCode ??
            (job.status === "expired"
              ? "DOCUMENT_EXTRACTION_TIMEOUT"
              : job.status === "cancelled"
                ? "DOCUMENT_EXTRACTION_CANCELLED"
                : "DOCUMENT_EXTRACTION_FAILED"),
        );
      }
      onProgress(job.status);
      const remaining = attempt.deadline - Date.now();
      if (remaining <= 0) {
        // Keep this attempt: a subsequent retry must first observe its terminal state.
        throw new ApiError(
          408,
          "Document analysis timed out",
          "DOCUMENT_EXTRACTION_TIMEOUT",
        );
      }
      const delay = Math.max(
        job.retryAfterMs ?? 0,
        Math.min(POLL_MAX_MS, POLL_MIN_MS * 1.5 ** poll++),
      );
      await wait(
        Math.min(remaining, delay + Math.random() * POLL_MIN_MS * 0.15),
        signal,
      );
      retrieve = true;
    } catch (error) {
      if (signal.aborted || attempt.cancelled) throw aborted();
      if (
        attempt.terminal ||
        (error instanceof ApiError &&
          error.code === "DOCUMENT_EXTRACTION_TIMEOUT")
      )
        throw error;
      if (!transient(error) || ++failures >= MAX_TRANSIENT_FAILURES)
        throw error;
      await wait(
        Math.min(POLL_MAX_MS, POLL_MIN_MS * 2 ** (failures - 1)),
        signal,
      );
      retrieve = Boolean(attempt.job);
    }
  }
  throw aborted();
}
