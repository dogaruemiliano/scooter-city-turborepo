"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

import { ApiError, v1 } from "@repo/api-shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";
import {
  cancelDocumentAnalysisAttempt,
  createDocumentAnalysisAttempt,
  runDocumentAnalysisAttempt,
  type DocumentAnalysisAttempt,
} from "./scooter-document-analysis-job";
import {
  reviewScooterDocumentVin,
  type ScooterVinCorrection,
} from "./scooter-vin-review";

export type AnalysisError =
  | "unknownType"
  | "disabled"
  | "unsupported"
  | "tooLarge"
  | "tooManyPages"
  | "encrypted"
  | "readFailed"
  | "invalidSource"
  | "timeout"
  | "throttled"
  | "cancelled"
  | "sessionExpired"
  | "unavailable"
  | "failed";
export type DocumentAnalysisState =
  | {
      status: "processing";
      phase?: v1.scooters.ScooterDocumentExtractionJob["status"];
    }
  | { status: "success"; analysis: v1.scooters.ScooterDocumentAnalysis }
  | { status: "failed"; error: AnalysisError };

function analysisError(error: unknown): AnalysisError {
  if (!(error instanceof ApiError)) return "failed";
  const codes: Record<string, AnalysisError> = {
    DOCUMENT_EXTRACTION_TYPE_UNKNOWN: "unknownType",
    DOCUMENT_EXTRACTION_DISABLED: "disabled",
    DOCUMENT_EXTRACTION_BAD_DOCUMENT: "unsupported",
    DOCUMENT_EXTRACTION_UNSUPPORTED_DOCUMENT: "unsupported",
    DOCUMENT_EXTRACTION_TOO_LARGE: "tooLarge",
    DOCUMENT_EXTRACTION_TOO_MANY_PAGES: "tooManyPages",
    DOCUMENT_EXTRACTION_ENCRYPTED_DOCUMENT: "encrypted",
    DOCUMENT_EXTRACTION_READ_FAILED: "readFailed",
    DOCUMENT_EXTRACTION_ACCESS_DENIED: "invalidSource",
    DOCUMENT_EXTRACTION_INVALID_SOURCE: "invalidSource",
    DOCUMENT_EXTRACTION_TIMEOUT: "timeout",
    DOCUMENT_EXTRACTION_CANCELLED: "cancelled",
    DOCUMENT_EDITOR_SESSION_UNAVAILABLE: "sessionExpired",
    DOCUMENT_EXTRACTION_THROTTLED: "throttled",
    DOCUMENT_EXTRACTION_UNAVAILABLE: "unavailable",
  };
  return (
    codes[error.code ?? ""] ?? (error.status === 429 ? "throttled" : "failed")
  );
}

/** Session-local results are tied to file identity, never a renewable upload token. */
export function useScooterDocumentAnalysis(
  documents: ScooterDocumentsEditor,
  scooterId?: string,
) {
  const canExtract = canAccess(
    useOptionalSession()?.user,
    "scooter_documents.extract",
  );
  const [entries, setEntries] = useState<Record<string, DocumentAnalysisState>>(
    {},
  );
  const [running, setRunning] = useState(false);
  const cache = useRef(new Map<string, DocumentAnalysisState>());
  const controllers = useRef(new Map<string, AbortController>());
  const attempts = useRef(new Map<string, DocumentAnalysisAttempt>());
  const generation = useRef(0);
  const activeRun = useRef(false);
  const mounted = useRef(true);
  const hasCiv = [...documents.existing, ...documents.drafts].some(
    (document) => document.type === "civ",
  );
  const sources = [
    ...documents.existing.map((doc) => ({
      id: doc.id,
      documentType: doc.type,
      key: JSON.stringify([doc.id, doc.type, doc.fileName, doc.byteSize]),
      source: {
        kind: "saved" as const,
        scooterId: scooterId!,
        documentId: doc.id,
      },
      ready: Boolean(scooterId),
    })),
    ...documents.drafts.map((doc) => ({
      id: doc.id,
      documentType: doc.requestedType ?? doc.uploadType ?? doc.type!,
      key: JSON.stringify([
        doc.id,
        doc.requestedType ?? doc.uploadType ?? doc.type,
        doc.file.name,
        doc.file.size,
        doc.file.lastModified,
      ]),
      source: {
        kind: "draft" as const,
        type: doc.requestedType ?? doc.uploadType ?? doc.type!,
        ...(doc.uploadType ? { uploadType: doc.uploadType } : {}),
        uploadToken: doc.uploadToken!,
      },
      ready: doc.status === "ready" && Boolean(doc.uploadToken),
    })),
  ].filter((source) => !hasCiv || source.documentType !== "import_document");
  const signature = JSON.stringify(sources.map(({ key }) => key));
  const latest = useRef(sources);
  const ensureSession = documents.ensureSession;
  const handleSessionError = documents.handleSessionError;
  // Event callbacks and pending requests always compare against the committed sources.
  useEffect(() => {
    latest.current = sources;
  });
  useEffect(() => {
    if (!canExtract) {
      generation.current += 1;
      activeRun.current = false;
    }
    const activeKeys = new Set(latest.current.map((source) => source.key));
    for (const [key, controller] of controllers.current) {
      if (!activeKeys.has(key) || !canExtract) {
        controller.abort();
        controllers.current.delete(key);
      }
    }
    for (const [key, attempt] of attempts.current) {
      if (!activeKeys.has(key) || !canExtract) {
        cancelDocumentAnalysisAttempt(attempt);
        attempts.current.delete(key);
      }
    }
    for (const [key, state] of cache.current)
      if (
        !activeKeys.has(key) ||
        (!canExtract && state.status === "processing")
      )
        cache.current.delete(key);
    setEntries(
      Object.fromEntries(
        latest.current.flatMap((source) => {
          const state = cache.current.get(source.key);
          return state ? [[source.id, state]] : [];
        }),
      ),
    );
  }, [signature, canExtract]);
  useEffect(() => {
    mounted.current = true;
    const pendingControllers = controllers.current;
    const pendingAttempts = attempts.current;
    return () => {
      mounted.current = false;
      generation.current += 1;
      pendingControllers.forEach((controller) => controller.abort());
      for (const attempt of pendingAttempts.values())
        cancelDocumentAnalysisAttempt(attempt);
    };
  }, []);

  const run = useCallback(
    async (options: { automatic?: boolean; sourceId?: string } = {}) => {
      if (!canExtract || activeRun.current) return null;
      activeRun.current = true;
      setRunning(true);
      const version = generation.current;
      const pending = latest.current.filter(
        (source) =>
          source.ready &&
          (!options.sourceId || source.id === options.sourceId) &&
          cache.current.get(source.key)?.status !== "success" &&
          (!options.automatic || !cache.current.has(source.key)),
      );
      const current = () => mounted.current && generation.current === version;
      const publish = (
        source: (typeof pending)[number],
        state: DocumentAnalysisState,
      ) => {
        if (
          !current() ||
          !latest.current.some((item) => item.key === source.key)
        )
          return;
        cache.current.set(source.key, state);
        setEntries((previous) => ({ ...previous, [source.id]: state }));
      };
      let index = 0;
      async function worker() {
        while (current() && index < pending.length) {
          const source = pending[index++]!;
          const controller = new AbortController();
          if (!latest.current.some((item) => item.key === source.key)) continue;
          controllers.current.set(source.key, controller);
          publish(source, { status: "processing" });
          try {
            const sessionId = await ensureSession();
            if (!current() || controller.signal.aborted) return;
            let attempt = attempts.current.get(source.key);
            if (!attempt || attempt.terminal) {
              attempt = createDocumentAnalysisAttempt({
                sourceId: source.id,
                source: source.source,
                sessionId,
                attemptId: crypto.randomUUID(),
              });
              attempts.current.set(source.key, attempt);
            }
            const analysis = await runDocumentAnalysisAttempt(
              attempt,
              source.documentType,
              controller.signal,
              (phase) => publish(source, { status: "processing", phase }),
            );
            if (
              analysis.sourceId !== source.id ||
              (source.documentType !== "unclassified" &&
                analysis.documentType !== source.documentType)
            )
              throw new Error("Unexpected document source");
            publish(source, { status: "success", analysis });
          } catch (error) {
            handleSessionError(error);
            if (!controller.signal.aborted)
              publish(source, {
                status: "failed",
                error: analysisError(error),
              });
          } finally {
            controllers.current.delete(source.key);
          }
        }
      }
      await Promise.all(
        Array.from(
          {
            length: v1.scooters.SCOOTER_DOCUMENT_EXTRACTION_CLIENT_CONCURRENCY,
          },
          () => worker(),
        ),
      );
      if (!current()) {
        if (mounted.current && !activeRun.current) setRunning(false);
        return null;
      }
      activeRun.current = false;
      setRunning(false);
      if (
        pending.some(
          (source) => !latest.current.some((item) => item.key === source.key),
        )
      )
        return null;
      return latest.current.map((source) => cache.current.get(source.key));
    },
    [canExtract, ensureSession, handleSessionError],
  );

  const cancel = useCallback(() => {
    generation.current += 1;
    activeRun.current = false;
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    for (const [key, attempt] of attempts.current) {
      if (!attempt.terminal) {
        cancelDocumentAnalysisAttempt(attempt);
        attempts.current.delete(key);
      }
    }
    for (const source of latest.current) {
      if (source.ready && cache.current.get(source.key)?.status !== "success")
        cache.current.set(source.key, { status: "failed", error: "cancelled" });
    }
    setEntries(
      Object.fromEntries(
        latest.current.flatMap((source) => {
          const state = cache.current.get(source.key);
          return state ? [[source.id, state]] : [];
        }),
      ),
    );
    setRunning(false);
  }, []);

  const dismissFailures = useCallback(() => {
    for (const [key, state] of cache.current)
      if (state.status === "failed") cache.current.delete(key);
    setEntries((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(
          ([, state]) => state.status !== "failed",
        ),
      ),
    );
  }, []);

  const reviewVins = useCallback((corrections: ScooterVinCorrection[]) => {
    if (activeRun.current || !mounted.current) return null;
    const updates = new Map<string, DocumentAnalysisState>();
    for (const correction of corrections) {
      const source = latest.current.find(
        (item) => item.id === correction.sourceId,
      );
      if (!source || updates.has(source.key)) return null;
      const state = cache.current.get(source.key);
      if (
        state?.status !== "success" ||
        state.analysis.extractedData.vin !== correction.previousVin
      )
        return null;
      const analysis = reviewScooterDocumentVin(state.analysis, correction.vin);
      if (!analysis) return null;
      updates.set(source.key, { status: "success", analysis });
    }
    for (const [key, state] of updates) cache.current.set(key, state);
    const nextEntries = Object.fromEntries(
      latest.current.flatMap((source) => {
        const state = cache.current.get(source.key);
        return state ? [[source.id, state]] : [];
      }),
    );
    setEntries(nextEntries);
    return Object.values(nextEntries);
  }, []);

  return {
    entries,
    running: canExtract && running,
    run,
    cancel,
    dismissFailures,
    reviewVins,
  };
}
