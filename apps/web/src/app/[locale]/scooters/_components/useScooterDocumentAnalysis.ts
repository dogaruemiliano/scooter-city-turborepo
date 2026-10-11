"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

import { ApiError, v1 } from "@repo/api-shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { webApi } from "@/lib/api";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";
import {
  reviewScooterDocumentVin,
  type ScooterVinCorrection,
} from "./scooter-vin-review";

export type AnalysisError =
  | "disabled"
  | "unsupported"
  | "tooLarge"
  | "tooManyPages"
  | "encrypted"
  | "readFailed"
  | "invalidSource"
  | "timeout"
  | "throttled"
  | "unavailable"
  | "failed";
export type DocumentAnalysisState =
  | { status: "processing" }
  | { status: "success"; analysis: v1.scooters.ScooterDocumentAnalysis }
  | { status: "failed"; error: AnalysisError };

function analysisError(error: unknown): AnalysisError {
  if (!(error instanceof ApiError)) return "failed";
  const codes: Record<string, AnalysisError> = {
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
  const controllers = useRef(new Set<AbortController>());
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
      documentType: doc.type,
      key: JSON.stringify([
        doc.id,
        doc.type,
        doc.file.name,
        doc.file.size,
        doc.file.lastModified,
      ]),
      source: {
        kind: "draft" as const,
        type: doc.type,
        uploadToken: doc.uploadToken!,
      },
      ready: doc.status === "ready" && Boolean(doc.uploadToken),
    })),
  ].filter((source) => !hasCiv || source.documentType !== "import_document");
  const signature = JSON.stringify(sources.map(({ key }) => key));
  const latest = useRef(sources);
  // Event callbacks and pending requests always compare against the committed sources.
  useEffect(() => {
    latest.current = sources;
  });
  useEffect(() => {
    generation.current += 1;
    activeRun.current = false;
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    const activeKeys = new Set(latest.current.map((source) => source.key));
    for (const [key, state] of cache.current)
      if (!activeKeys.has(key) || state.status === "processing")
        cache.current.delete(key);
    setEntries(
      Object.fromEntries(
        latest.current.flatMap((source) => {
          const state = cache.current.get(source.key);
          return state ? [[source.id, state]] : [];
        }),
      ),
    );
    setRunning(false);
  }, [signature, canExtract]);
  useEffect(() => {
    mounted.current = true;
    const pendingControllers = controllers.current;
    return () => {
      mounted.current = false;
      generation.current += 1;
      pendingControllers.forEach((controller) => controller.abort());
    };
  }, []);

  const run = useCallback(async () => {
    if (
      !canExtract ||
      activeRun.current ||
      latest.current.some((source) => !source.ready)
    )
      return null;
    activeRun.current = true;
    setRunning(true);
    const version = generation.current;
    const pending = latest.current.filter(
      (source) => cache.current.get(source.key)?.status !== "success",
    );
    const current = () => mounted.current && generation.current === version;
    const publish = (
      source: (typeof pending)[number],
      state: DocumentAnalysisState,
    ) => {
      if (!current() || !latest.current.some((item) => item.key === source.key))
        return;
      cache.current.set(source.key, state);
      setEntries((previous) => ({ ...previous, [source.id]: state }));
    };
    let index = 0;
    async function worker() {
      while (current() && index < pending.length) {
        const source = pending[index++]!;
        const controller = new AbortController();
        controllers.current.add(controller);
        publish(source, { status: "processing" });
        try {
          const analysis = await webApi.fetch(
            v1.scooters.ROUTES.documents.extract,
            v1.scooters.scooterDocumentAnalysisSchema,
            {
              method: "POST",
              json: { sourceId: source.id, source: source.source },
              signal: controller.signal,
            },
          );
          if (
            analysis.sourceId !== source.id ||
            analysis.documentType !== source.documentType
          )
            throw new Error("Unexpected document source");
          publish(source, { status: "success", analysis });
        } catch (error) {
          if (!controller.signal.aborted)
            publish(source, { status: "failed", error: analysisError(error) });
        } finally {
          controllers.current.delete(controller);
        }
      }
    }
    await Promise.all(
      Array.from(
        { length: v1.scooters.SCOOTER_DOCUMENT_EXTRACTION_CLIENT_CONCURRENCY },
        () => worker(),
      ),
    );
    if (!current()) return null;
    activeRun.current = false;
    setRunning(false);
    return latest.current.map((source) => cache.current.get(source.key));
  }, [canExtract]);

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

  return { entries, running, run, dismissFailures, reviewVins };
}
