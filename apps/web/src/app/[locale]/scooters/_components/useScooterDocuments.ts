"use client";

import { ApiError, v1 } from "@repo/api-shared";
import { useCallback, useMemo, useRef, useState } from "react";
import { webApi } from "@/lib/api";
import {
  isScooterEditorSessionUnavailable,
  useScooterEditorSession,
} from "./useScooterEditorSession";

import { resolveDocumentVersions } from "./scooter-document-versions";

export interface DocumentDraft {
  id: string;
  version?: "original" | "client_copy";
  originalId?: string;
  versionSource?: "filename" | "branded_overlay" | "manual";
  type: v1.scooters.ScooterDocumentType | null;
  uploadType?: "unclassified";
  requestedType?: v1.scooters.ScooterDocumentType;
  insurancePolicyId?: string;
  file: File;
  /** Restored uploads keep metadata until a private preview is requested. */
  fileUnavailable?: boolean;
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

export interface ScooterDocumentsSnapshot {
  drafts: (Omit<DocumentDraft, "file"> & {
    file: { name: string; type: string; size: number; lastModified: number };
  })[];
  extractions: Record<string, v1.scooters.ScooterDocumentExtractedData | null>;
  removedIds: string[];
}

function restoreDraft(
  draft: ScooterDocumentsSnapshot["drafts"][number],
): DocumentDraft {
  const file = new File([], draft.file.name, {
    type: draft.file.type,
    lastModified: draft.file.lastModified,
  });
  Object.defineProperty(file, "size", { value: draft.file.size });
  return {
    ...draft,
    file,
    fileUnavailable: true,
    status: draft.uploadToken ? "ready" : "failed",
    ...(!draft.uploadToken ? { uploadError: "connectionFailed" as const } : {}),
  };
}

export function useScooterDocuments(
  existing: v1.scooters.ScooterDocument[] = [],
  options: {
    session?: v1.scooters.ScooterDocumentEditorSession;
    snapshot?: ScooterDocumentsSnapshot;
    detectClientCopies?: boolean;
  } = {},
) {
  const editorSession = useScooterEditorSession(options.session);
  const [uploadedDrafts, setDrafts] = useState<DocumentDraft[]>(
    () => options.snapshot?.drafts.map(restoreDraft) ?? [],
  );
  const [extractions, setExtractions] = useState<
    Record<string, v1.scooters.ScooterDocumentExtractedData | null>
  >(() => options.snapshot?.extractions ?? {});
  const detectClientCopies = options.detectClientCopies ?? true;
  const drafts = useMemo(
    () =>
      detectClientCopies
        ? resolveDocumentVersions(uploadedDrafts, extractions)
        : uploadedDrafts,
    [uploadedDrafts, extractions, detectClientCopies],
  );
  const [removedIds, setRemovedIds] = useState<string[]>(
    () => options.snapshot?.removedIds ?? [],
  );
  const uploading = useRef(new Set<string>());

  async function upload(draft: DocumentDraft) {
    if (draft.fileUnavailable || uploading.current.has(draft.id)) return;
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
    version?: "original" | "client_copy",
    originalId?: string,
  ) {
    const items: DocumentDraft[] = files.map((file) => ({
      id: crypto.randomUUID(),
      version,
      ...(version ? { versionSource: "manual" as const } : {}),
      originalId,
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
    setVersion: useCallback(
      (
        id: string,
        version: "original" | "client_copy",
        originalId?: string,
      ) => {
        setDrafts((current) =>
          current.map((draft) =>
            draft.id === id
              ? { ...draft, version, originalId, versionSource: "manual" }
              : draft,
          ),
        );
      },
      [],
    ),
    assignInsurance: useCallback((id: string) => {
      setDrafts((current) => {
        const draft = current.find((item) => item.id === id);
        if (!draft || draft.insurancePolicyId) return current;
        const policyId =
          current.find((item) => item.insurancePolicyId)?.insurancePolicyId ??
          crypto.randomUUID();
        return current.map((item) =>
          item.id === id ? { ...item, insurancePolicyId: policyId } : item,
        );
      });
    }, []),
    snapshot: {
      drafts: drafts.map(({ file, ...draft }) => ({
        ...draft,
        file: {
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
        },
      })),
      extractions,
      removedIds,
    } satisfies ScooterDocumentsSnapshot,
    async preview(draft: DocumentDraft): Promise<File> {
      if (!draft.fileUnavailable) return draft.file;
      if (!options.session || !draft.uploadToken)
        throw new Error("Upload unavailable");
      const response = await fetch(
        webApi.url(
          `/v1/scooters/import-drafts/${encodeURIComponent(options.session.id)}/document-content`,
        ),
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "fetch",
          },
          body: JSON.stringify({
            sourceId: draft.id,
            source: {
              kind: "draft",
              type: draft.requestedType ?? draft.uploadType ?? draft.type,
              ...(draft.uploadType ? { uploadType: draft.uploadType } : {}),
              uploadToken: draft.uploadToken,
            },
          }),
        },
      );
      if (!response.ok) throw new Error("Preview unavailable");
      const file = new File([await response.blob()], draft.file.name, {
        type: draft.file.type,
        lastModified: draft.file.lastModified,
      });
      setDrafts((current) =>
        current.map((item) =>
          item.id === draft.id
            ? { ...item, file, fileUnavailable: false }
            : item,
        ),
      );
      return file;
    },
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
    removeDraft: (id: string) => {
      const removed = new Set(
        drafts
          .filter((item) => item.id === id || item.originalId === id)
          .map((item) => item.id),
      );
      setDrafts((current) => current.filter((item) => !removed.has(item.id)));
    },
    removeExisting: (id: string) =>
      setRemovedIds((current) => [...current, id]),
    undoRemove: (id: string) =>
      setRemovedIds((current) => current.filter((item) => item !== id)),
    blocked: drafts.some(
      (item) =>
        item.status !== "ready" ||
        (item.version === "client_copy"
          ? !drafts.some(
              (original) =>
                original.id === item.originalId &&
                original.version !== "client_copy",
            ) ||
            drafts.filter(
              (copy) =>
                copy.originalId === item.originalId &&
                copy.version === "client_copy",
            ).length !== 1
          : item.type === null),
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
                } =>
                  item.status === "ready" &&
                  item.type !== null &&
                  item.version !== "client_copy",
              )
              .map((item) => ({
                type:
                  item.uploadType === "unclassified" &&
                  extractions[item.id]?.documents?.length
                    ? (extractions[item.id]!.documents!.find(
                        (document) => document.documentType === "civ",
                      )?.documentType ??
                      extractions[item.id]!.documents![0]!.documentType)
                    : item.type,
                ...(item.uploadType ? { uploadType: item.uploadType } : {}),
                ...(item.insurancePolicyId &&
                extractions[item.id]?.currentInsuranceDocumentId !== null
                  ? { insurancePolicyId: item.insurancePolicyId }
                  : {}),
                ...(drafts.find(
                  (copy) =>
                    copy.originalId === item.id &&
                    copy.version === "client_copy" &&
                    copy.status === "ready",
                )
                  ? {
                      clientCopy: (() => {
                        const copy = drafts.find(
                          (copy) =>
                            copy.originalId === item.id &&
                            copy.version === "client_copy",
                        )!;
                        return {
                          fileName: copy.file.name,
                          uploadToken: copy.uploadToken!,
                          uploadType: copy.uploadType ?? copy.type!,
                        };
                      })(),
                    }
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
