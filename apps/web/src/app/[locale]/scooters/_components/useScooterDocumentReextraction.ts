"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, v1 } from "@repo/api-shared";
import {
  cancelDocumentAnalysisAttempt,
  createDocumentAnalysisAttempt,
  runDocumentAnalysisAttempt,
  type DocumentAnalysisAttempt,
} from "./scooter-document-analysis-job";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";

export type ReextractionEntry =
  | { status: "processing" }
  | { status: "success"; analysis: v1.scooters.ScooterDocumentAnalysis }
  | { status: "failed"; error: string };

/** Explicit, isolated analysis: results never enter the editor's auto-import cache. */
export function useScooterDocumentReextraction(
  documents: ScooterDocumentsEditor,
  scooterId: string,
) {
  const [entries, setEntries] = useState<Record<string, ReextractionEntry>>({});
  const [running, setRunning] = useState(false);
  const latest = useRef(documents);
  const active = useRef<{
    controller: AbortController;
    attempts: Set<DocumentAnalysisAttempt>;
  } | null>(null);
  useEffect(() => {
    latest.current = documents;
  });
  useEffect(
    () => () => {
      active.current?.controller.abort();
      active.current?.attempts.forEach(cancelDocumentAnalysisAttempt);
      active.current = null;
    },
    [],
  );

  function cancel() {
    const run = active.current;
    if (!run) return;
    run.controller.abort();
    run.attempts.forEach(cancelDocumentAnalysisAttempt);
    active.current = null;
    setRunning(false);
    setEntries({});
  }

  async function run(onlyIds?: string[]) {
    if (active.current) return;
    const files = latest.current.existing.filter(
      (document) =>
        !document.extractedData?.clientCopy &&
        (!onlyIds || onlyIds.includes(document.id)),
    );
    if (!files.length) return;
    const operation = {
      controller: new AbortController(),
      attempts: new Set<DocumentAnalysisAttempt>(),
    };
    active.current = operation;
    setRunning(true);
    setEntries((previous) => ({
      ...(onlyIds ? previous : {}),
      ...Object.fromEntries(
        files.map((file) => [file.id, { status: "processing" as const }]),
      ),
    }));
    const current = () =>
      active.current === operation && !operation.controller.signal.aborted;
    let index = 0;
    async function worker() {
      while (current() && index < files.length) {
        const file = files[index++]!;
        let entry: ReextractionEntry;
        try {
          const sessionId = await latest.current.ensureSession();
          if (!current()) return;
          const attempt = createDocumentAnalysisAttempt({
            sourceId: file.id,
            source: { kind: "saved", scooterId, documentId: file.id },
            sessionId,
            attemptId: crypto.randomUUID(),
          });
          operation.attempts.add(attempt);
          const analysis = await runDocumentAnalysisAttempt(
            attempt,
            file.type,
            operation.controller.signal,
            () => {},
          );
          if (analysis.sourceId !== file.id)
            throw new Error("Unexpected source");
          entry = { status: "success", analysis };
        } catch (error) {
          if (!current()) return;
          latest.current.handleSessionError(error);
          entry = {
            status: "failed",
            error:
              error instanceof ApiError && error.status === 429
                ? "throttled"
                : "failed",
          };
        }
        if (current())
          setEntries((previous) => ({ ...previous, [file.id]: entry }));
      }
    }
    await Promise.all(
      Array.from(
        {
          length: Math.min(
            files.length,
            v1.scooters.SCOOTER_DOCUMENT_EXTRACTION_CLIENT_CONCURRENCY,
          ),
        },
        worker,
      ),
    );
    if (current()) {
      active.current = null;
      setRunning(false);
    }
  }

  return { entries, running, run, cancel };
}
