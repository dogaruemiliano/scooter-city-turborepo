"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { webApi } from "@/lib/api";
import {
  reconcileDocumentExtraction,
  type ExtractionState,
} from "./extraction-state";
import type { CreatePersonDocumentFormState } from "./types";

export interface DocumentExtractionJob {
  signature: string;
  status: "pending" | "success" | "error" | "disabled" | "manual";
  warnings?: v1.persons.PersonDocumentExtraction["warnings"];
}

export function documentExtractionSignature(
  document: CreatePersonDocumentFormState,
): string | null {
  const photos = v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS.map((slot) => ({
    slot,
    photo: document.photos[slot],
  }));
  if (
    photos.some(
      ({ photo }) =>
        photo?.status === "uploading" || photo?.status === "failed",
    )
  )
    return null;
  const uploaded = photos.filter(({ photo }) => photo?.status === "uploaded");
  if (!uploaded.length) return null;
  return JSON.stringify([
    document.type,
    document.nationalIdFormat,
    uploaded.map(({ slot, photo }) => [slot, photo!.id]),
  ]);
}

export function useDocumentExtraction(
  state: ExtractionState,
  setState: Dispatch<SetStateAction<ExtractionState>>,
) {
  const [jobs, setJobs] = useState<Record<string, DocumentExtractionJob>>({});
  const requests = useRef(
    new Map<string, { signature: string; controller: AbortController }>(),
  );
  const completed = useRef(new Map<string, string>());

  useEffect(() => {
    const active = new Map(
      state.form.documents.map((document) => [
        document.key,
        documentExtractionSignature(document),
      ]),
    );
    for (const [key, request] of requests.current) {
      if (active.get(key) !== request.signature) {
        request.controller.abort();
        requests.current.delete(key);
      }
    }
    for (const document of state.form.documents) {
      const signature = active.get(document.key);
      if (
        !signature ||
        requests.current.has(document.key) ||
        completed.current.get(document.key) === signature
      )
        continue;
      const controller = new AbortController();
      const request = { signature, controller };
      requests.current.set(document.key, request);
      const isCurrent = () =>
        requests.current.get(document.key) === request &&
        !controller.signal.aborted;
      async function extract() {
        setJobs((current) => ({
          ...current,
          [document.key]: { signature: signature!, status: "pending" },
        }));
        try {
          const photos = Object.fromEntries(
            v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS.flatMap((slot) => {
              const photo = document.photos[slot];
              return photo?.status === "uploaded"
                ? [[slot, photo.uploadToken]]
                : [];
            }),
          );
          const result = await webApi.fetch(
            v1.persons.ROUTES.documents.extract,
            v1.persons.personDocumentExtractionSchema,
            {
              method: "POST",
              signal: controller.signal,
              json: {
                documentType: document.type,
                ...(document.nationalIdFormat
                  ? { nationalIdFormat: document.nationalIdFormat }
                  : {}),
                photos,
              },
            },
          );
          if (!isCurrent()) return;
          setState((current) => {
            const latest = current.form.documents.find(
              (item) => item.key === document.key,
            );
            if (
              !latest ||
              documentExtractionSignature(latest) !== signature ||
              controller.signal.aborted
            )
              return current;
            return reconcileDocumentExtraction(current, {
              documentKey: document.key,
              sourceSignature: signature!,
              result,
            });
          });
          completed.current.set(document.key, signature!);
          setJobs((current) => ({
            ...current,
            [document.key]: {
              signature: signature!,
              status: "success",
              warnings: result.warnings,
            },
          }));
        } catch (error) {
          if (!isCurrent()) return;
          completed.current.set(document.key, signature!);
          setJobs((current) => ({
            ...current,
            [document.key]: {
              signature: signature!,
              status:
                error instanceof ApiError &&
                error.code === "DOCUMENT_EXTRACTION_DISABLED"
                  ? "disabled"
                  : "error",
            },
          }));
        } finally {
          if (requests.current.get(document.key) === request)
            requests.current.delete(document.key);
        }
      }
      void extract();
    }
  }, [state.form.documents, setState, jobs]);

  useEffect(
    () => () => {
      for (const request of requests.current.values())
        request.controller.abort();
      requests.current.clear();
    },
    [],
  );

  function cancelDocument(key: string) {
    requests.current.get(key)?.controller.abort();
    requests.current.delete(key);
    completed.current.delete(key);
    setJobs((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function continueManually() {
    const nextJobs: Record<string, DocumentExtractionJob> = {};
    for (const document of state.form.documents) {
      const signature = documentExtractionSignature(document);
      if (!signature) continue;
      requests.current.get(document.key)?.controller.abort();
      requests.current.delete(document.key);
      completed.current.set(document.key, signature);
      const existing = jobs[document.key];
      nextJobs[document.key] =
        existing?.signature === signature && existing.status !== "pending"
          ? existing
          : { signature, status: "manual" };
    }
    setJobs(nextJobs);
  }

  const pendingDocumentKeys = new Set(
    state.form.documents.flatMap((document) => {
      const signature = documentExtractionSignature(document);
      return signature &&
        (jobs[document.key]?.signature !== signature ||
          jobs[document.key]?.status === "pending")
        ? [document.key]
        : [];
    }),
  );
  return {
    jobs,
    pending: pendingDocumentKeys.size > 0,
    pendingDocumentKeys,
    retry: cancelDocument,
    cancelDocument,
    continueManually,
  };
}
