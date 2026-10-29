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

export interface ScooterAnalysisSnapshot {
  entries: Record<string, DocumentAnalysisState>;
  attempts: {
    key: string;
    input: DocumentAnalysisAttempt["input"];
    job?: DocumentAnalysisAttempt["job"];
    cancelled: boolean;
    terminal: boolean;
    deadline: number;
  }[];
  cache: [string, string][];
}

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
  options: { persistent?: boolean; snapshot?: ScooterAnalysisSnapshot } = {},
) {
  const persistent = Boolean(options.persistent);
  const canExtract = canAccess(
    useOptionalSession()?.user,
    "scooter_documents.extract",
  );
  const [entries, setEntries] = useState<Record<string, DocumentAnalysisState>>(
    options.snapshot?.entries ?? {},
  );
  const [running, setRunning] = useState(false);
  const cache = useRef(
    new Map<string, DocumentAnalysisState>([
      ...documents.existing.flatMap((doc): [string, DocumentAnalysisState][] =>
        doc.extractedData
          ? [
              [
                JSON.stringify([doc.id, doc.type, doc.fileName, doc.byteSize]),
                {
                  status: "success",
                  analysis: {
                    sourceId: doc.id,
                    documentType: doc.type,
                    extractedData: doc.extractedData,
                    issues: [],
                    reviewRequired: true,
                  },
                },
              ],
            ]
          : [],
      ),
      ...(options.snapshot?.cache.flatMap(
        ([key, id]): [string, DocumentAnalysisState][] =>
          options.snapshot?.entries[id]
            ? [[key, options.snapshot.entries[id]]]
            : [],
      ) ?? []),
    ]),
  );
  const controllers = useRef(new Map<string, AbortController>());
  const [initialAttempts] = useState(
    () =>
      new Map<string, DocumentAnalysisAttempt>(
        options.snapshot?.attempts.map((attempt) => [
          attempt.key,
          {
            ...attempt,
            deadline: Math.max(attempt.deadline, Date.now() + 5 * 60_000),
          },
        ]),
      ),
  );
  const attempts = useRef(initialAttempts);
  const scheduled = useRef(new Set<string>());
  const generation = useRef(0);
  const activeRun = useRef(false);
  const mounted = useRef(true);
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
      ready: false, // Saved files are retained as evidence, never queued for extraction.
    })),
    ...documents.drafts
      .filter((doc) => doc.version !== "client_copy")
      .map((doc) => ({
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
  ];
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
      if (!options.persistent)
        for (const attempt of pendingAttempts.values())
          cancelDocumentAnalysisAttempt(attempt);
    };
  }, [options.persistent]);

  const run = useCallback(
    async (options: { automatic?: boolean; sourceId?: string } = {}) => {
      if (!canExtract) return null;
      const version = generation.current;
      const pending = latest.current.filter(
        (source) =>
          source.ready &&
          (!options.sourceId || source.id === options.sourceId) &&
          cache.current.get(source.key)?.status !== "success" &&
          !scheduled.current.has(source.key) &&
          (!options.automatic ||
            !cache.current.has(source.key) ||
            cache.current.get(source.key)?.status === "processing"),
      );
      const capacity = Math.max(
        0,
        v1.scooters.SCOOTER_DOCUMENT_EXTRACTION_CLIENT_CONCURRENCY -
          controllers.current.size,
      );
      if (!pending.length)
        return latest.current.map((source) => cache.current.get(source.key));
      if (!capacity) return null;
      // Reserve source identities, so later uploads can join free workers without duplicate requests.
      for (const source of pending) scheduled.current.add(source.key);
      activeRun.current = true;
      setRunning(true);
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
          if (
            controllers.current.size >=
            v1.scooters.SCOOTER_DOCUMENT_EXTRACTION_CLIENT_CONCURRENCY
          )
            break;
          const controller = new AbortController();
          if (!latest.current.some((item) => item.key === source.key)) continue;
          controllers.current.set(source.key, controller);
          activeRun.current = true;
          setRunning(true);
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
              if (persistent) attempt.deadline = Date.now() + 24 * 60 * 60_000;
              attempts.current.set(source.key, attempt);
              publish(source, { status: "processing", phase: "queued" });
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
            scheduled.current.delete(source.key);
            if (current()) {
              activeRun.current = controllers.current.size > 0;
              setRunning(activeRun.current);
            }
          }
        }
      }
      await Promise.all(
        Array.from(
          {
            length: capacity,
          },
          () => worker(),
        ),
      );
      for (const source of pending) scheduled.current.delete(source.key);
      if (!current()) {
        if (mounted.current && !activeRun.current) setRunning(false);
        return null;
      }
      activeRun.current = controllers.current.size > 0;
      setRunning(activeRun.current);
      if (
        pending.some(
          (source) => !latest.current.some((item) => item.key === source.key),
        )
      )
        return null;
      return latest.current.map((source) => cache.current.get(source.key));
    },
    [canExtract, ensureSession, handleSessionError, persistent],
  );

  const cancel = useCallback(() => {
    generation.current += 1;
    activeRun.current = false;
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    scheduled.current.clear();
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
    const reviewed = new Set<string>();
    for (const correction of corrections) {
      const source = latest.current.find(
        (item) => item.id === correction.sourceId,
      );
      const readingKey = JSON.stringify([
        correction.sourceId,
        correction.documentId,
      ]);
      if (!source || reviewed.has(readingKey)) return null;
      reviewed.add(readingKey);
      const state = updates.get(source.key) ?? cache.current.get(source.key);
      const reading =
        state?.status === "success"
          ? correction.documentId === undefined
            ? state.analysis.extractedData
            : state.analysis.extractedData.documents?.find(
                (document) => document.id === correction.documentId,
              )
          : undefined;
      if (
        state?.status !== "success" ||
        !reading ||
        reading.vin !== correction.previousVin
      )
        return null;
      const analysis = reviewScooterDocumentVin(
        state.analysis,
        correction.vin,
        correction.documentId,
      );
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

  const updateLogicalDocument = useCallback(
    (
      sourceId: string,
      documentId: string,
      patch: Partial<
        Pick<
          v1.scooters.LogicalDocumentExtraction,
          "vin" | "documentType" | "pages"
        >
      >,
    ) => {
      const source = latest.current.find((item) => item.id === sourceId);
      if (!source || controllers.current.has(source.key)) return;
      const previous = cache.current.get(source.key);
      if (previous?.status !== "success") return;
      let documents = previous.analysis.extractedData.documents?.map(
        (document) =>
          document.id === documentId
            ? {
                ...document,
                ...patch,
                ...(Object.hasOwn(patch, "vin")
                  ? {
                      fields: {
                        ...document.fields,
                        ...(Object.hasOwn(document.fields, "vin")
                          ? { vin: patch.vin ?? null }
                          : {}),
                        ...(Object.hasOwn(document.fields, "documentVin")
                          ? { documentVin: patch.vin ?? null }
                          : {}),
                      },
                      vinReview: {
                        method: "manual" as const,
                        originalVin: document.vinReview
                          ? document.vinReview.originalVin
                          : document.vin,
                      },
                    }
                  : {}),
              }
            : document,
      );
      documents = documents?.map((document) =>
        v1.scooters.scooterDocumentReadsVin(document.documentType)
          ? document
          : {
              ...document,
              vin: null,
              fields: Object.fromEntries(
                Object.entries(document.fields).filter(
                  ([field]) => !["vin", "documentVin"].includes(field),
                ),
              ),
              issues: document.issues?.filter(
                (issue) => !["vin", "documentVin"].includes(issue.field),
              ),
            },
      );
      const vins = [
        ...new Set(
          documents
            ?.map((document) => document.vin)
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      const next: DocumentAnalysisState = {
        status: "success",
        analysis: {
          ...previous.analysis,
          extractedData: {
            ...previous.analysis.extractedData,
            documents,
            vin: vins.length === 1 ? vins[0]! : null,
            fields: {
              ...previous.analysis.extractedData.fields,
              ...(Object.hasOwn(previous.analysis.extractedData.fields, "vin")
                ? { vin: vins.length === 1 ? vins[0]! : null }
                : {}),
            },
          },
        },
      };
      cache.current.set(source.key, next);
      setEntries((current) => ({ ...current, [sourceId]: next }));
    },
    [],
  );

  return {
    updateLogicalDocument,
    entries,
    getSnapshot: () =>
      ({
        entries,
        cache: [...cache.current].flatMap(([key]) => {
          const source = latest.current.find((item) => item.key === key);
          return source ? [[key, source.id] as [string, string]] : [];
        }),
        attempts: [...attempts.current]
          .filter(([, attempt]) => !attempt.terminal)
          .map(([key, attempt]) => {
            const job = attempt.job
              ? { ...attempt.job, result: undefined }
              : undefined;
            return {
              key,
              input: attempt.input,
              job,
              cancelled: attempt.cancelled,
              terminal: attempt.terminal,
              deadline: attempt.deadline,
            };
          }),
      }) satisfies ScooterAnalysisSnapshot,
    running: canExtract && running,
    run,
    cancel,
    dismissFailures,
    reviewVins,
  };
}
