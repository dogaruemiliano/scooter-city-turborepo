"use client";

import { ApiError, v1 } from "@repo/api-shared";
import { useCallback, useRef, useState } from "react";
import { webApi } from "@/lib/api";
import {
  isScooterEditorSessionUnavailable,
  useScooterEditorSession,
} from "./useScooterEditorSession";

export interface DocumentDraft {
  id: string;
  type: v1.scooters.ScooterDocumentType | null;
  uploadType?: "unclassified";
  requestedType?: v1.scooters.ScooterDocumentType;
  insurancePolicyId?: string;
  file: File;
  status: "uploading" | "ready" | "failed";
  uploadToken?: string;
  uploadError?:
    | "sessionExpired"
    | "uploadLimit"
    | "serverTooLarge"
    | "storageUnavailable"
    | "uploadDenied"
    | "connectionFailed";
  uploadMaxBytes?: number;
}

function uploadFailure(
  error: unknown,
): Pick<DocumentDraft, "uploadError" | "uploadMaxBytes"> {
  if (isScooterEditorSessionUnavailable(error))
    return { uploadError: "sessionExpired" };
  if (error instanceof ApiError) {
    if (error.status === 413 || error.code === "FILE_TOO_LARGE") {
      const details = error.details;
      const maxBytes =
        details && typeof details === "object" && "maxBytes" in details
          ? details.maxBytes
          : undefined;
      return typeof maxBytes === "number" &&
        Number.isSafeInteger(maxBytes) &&
        maxBytes > 0
        ? { uploadError: "uploadLimit", uploadMaxBytes: maxBytes }
        : { uploadError: "serverTooLarge" };
    }
    if (error.status === 401 || error.status === 403)
      return { uploadError: "uploadDenied" };
    if (error.status >= 500) return { uploadError: "storageUnavailable" };
  }
  if (error instanceof TypeError) return { uploadError: "connectionFailed" };
  return {};
}

export function useScooterDocuments(
  existing: v1.scooters.ScooterDocument[] = [],
) {
  const editorSession = useScooterEditorSession();
  const [drafts, setDrafts] = useState<DocumentDraft[]>([]);
  const [extractions, setExtractions] = useState<
    Record<string, v1.scooters.ScooterDocumentExtractedData | null>
  >({});
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const uploading = useRef(new Set<string>());

  async function upload(draft: DocumentDraft) {
    if (uploading.current.has(draft.id)) return;
    uploading.current.add(draft.id);
    setDrafts((current) =>
      current.map((item) =>
        item.id === draft.id
          ? {
              ...item,
              status: "uploading",
              uploadError: undefined,
              uploadMaxBytes: undefined,
            }
          : item,
      ),
    );
    try {
      const sessionId = await editorSession.ensureSession();
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await draft.file.arrayBuffer(),
      );
      const checksumSha256 = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const upload = await webApi.fetch(
        v1.scooters.ROUTES.documents.createDraftUpload,
        v1.scooters.scooterDocumentUploadSchema,
        {
          method: "POST",
          json: {
            sessionId,
            type: draft.uploadType ?? draft.type,
            contentType: draft.file.type,
            byteSize: draft.file.size,
            checksumSha256,
          },
        },
      );
      if (draft.file.size > upload.maxBytes)
        throw new ApiError(
          413,
          "File exceeds the upload limit",
          "FILE_TOO_LARGE",
          {
            maxBytes: upload.maxBytes,
          },
        );
      const response = await fetch(upload.uploadUrl, {
        method: upload.method,
        headers: upload.headers,
        body: draft.file,
      });
      if (!response.ok)
        throw new ApiError(response.status, "Storage rejected the upload");
      setDrafts((current) =>
        current.map((item) =>
          item.id === draft.id
            ? { ...item, status: "ready", uploadToken: upload.uploadToken }
            : item,
        ),
      );
    } catch (error) {
      editorSession.handleSessionError(error);
      setDrafts((current) =>
        current.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                status: "failed",
                uploadToken: undefined,
                ...uploadFailure(error),
              }
            : item,
        ),
      );
    } finally {
      uploading.current.delete(draft.id);
    }
  }

  function add(
    type: v1.scooters.ScooterDocumentType | null,
    files: File[],
    insurancePolicyId?: string,
  ) {
    const items: DocumentDraft[] = files.map((file) => ({
      id: crypto.randomUUID(),
      type,
      ...(type === null ? { uploadType: "unclassified" as const } : {}),
      insurancePolicyId,
      file,
      status: "uploading",
    }));
    setDrafts((current) => [...current, ...items]);
    for (const item of items) void upload(item);
  }

  const classify = useCallback(
    (id: string, type: v1.scooters.ScooterDocumentType, manual = false) => {
      const policyId = type === "insurance" ? crypto.randomUUID() : undefined;
      setDrafts((current) =>
        current.map((item) => {
          if (
            item.id !== id ||
            item.type === type ||
            (!manual && item.type !== null)
          )
            return item;
          return {
            ...item,
            type,
            ...(manual ? { requestedType: type } : {}),
            insurancePolicyId:
              type === "insurance"
                ? (item.insurancePolicyId ??
                  current.find(
                    (draft) => draft.type === "insurance" && draft.id !== id,
                  )?.insurancePolicyId ??
                  policyId)
                : undefined,
          };
        }),
      );
    },
    [],
  );

  return {
    ...editorSession,
    classify,
    drafts,
    extractions,
    setExtractions,
    removedIds,
    removed: existing.filter((item) => removedIds.includes(item.id)),
    existing: existing.filter((item) => !removedIds.includes(item.id)),
    add,
    retry: (draft: DocumentDraft) => {
      void upload(draft);
    },
    removeDraft: (id: string) =>
      setDrafts((current) => current.filter((item) => item.id !== id)),
    removeExisting: (id: string) =>
      setRemovedIds((current) => [...current, id]),
    undoRemove: (id: string) =>
      setRemovedIds((current) => current.filter((item) => item !== id)),
    blocked: drafts.some(
      (item) => item.status !== "ready" || item.type === null,
    ),
    changed:
      drafts.length > 0 ||
      removedIds.length > 0 ||
      [
        ...existing.filter((doc) => !removedIds.includes(doc.id)),
        ...drafts,
      ].some((doc) => doc.id in extractions),
    payload: {
      ...(drafts.length
        ? {
            documentDrafts: drafts
              .filter(
                (
                  item,
                ): item is DocumentDraft & {
                  type: v1.scooters.ScooterDocumentType;
                } => item.status === "ready" && item.type !== null,
              )
              .map((item) => ({
                type: item.type,
                ...(item.uploadType ? { uploadType: item.uploadType } : {}),
                ...(item.insurancePolicyId
                  ? { insurancePolicyId: item.insurancePolicyId }
                  : {}),
                fileName: item.file.name,
                uploadToken: item.uploadToken!,
                ...(extractions[item.id]
                  ? { extractedData: extractions[item.id] }
                  : {}),
              })),
          }
        : {}),
      ...(existing.some(
        (doc) => doc.id in extractions && !removedIds.includes(doc.id),
      )
        ? {
            documentExtractions: existing
              .filter(
                (doc) => doc.id in extractions && !removedIds.includes(doc.id),
              )
              .map((doc) => ({
                documentId: doc.id,
                extractedData: extractions[doc.id] ?? null,
              })),
          }
        : {}),
      ...(removedIds.length ? { removedDocumentIds: removedIds } : {}),
    },
  };
}
export type ScooterDocumentsEditor = ReturnType<typeof useScooterDocuments>;
