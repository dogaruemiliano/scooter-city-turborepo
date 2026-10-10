"use client";

import { v1 } from "@repo/api-shared";
import { useRef, useState } from "react";
import { webApi } from "@/lib/api";

export interface DocumentDraft {
  id: string;
  type: v1.scooters.ScooterDocumentType;
  file: File;
  status: "uploading" | "ready" | "failed";
  uploadToken?: string;
}

export function useScooterDocuments(
  existing: v1.scooters.ScooterDocument[] = [],
) {
  const [drafts, setDrafts] = useState<DocumentDraft[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const uploading = useRef(new Set<string>());

  async function upload(draft: DocumentDraft) {
    if (uploading.current.has(draft.id)) return;
    uploading.current.add(draft.id);
    setDrafts((current) =>
      current.map((item) =>
        item.id === draft.id ? { ...item, status: "uploading" } : item,
      ),
    );
    try {
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
            type: draft.type,
            contentType: draft.file.type,
            byteSize: draft.file.size,
            checksumSha256,
          },
        },
      );
      const response = await fetch(upload.uploadUrl, {
        method: upload.method,
        headers: upload.headers,
        body: draft.file,
      });
      if (!response.ok) throw new Error("Upload failed");
      setDrafts((current) =>
        current.map((item) =>
          item.id === draft.id
            ? { ...item, status: "ready", uploadToken: upload.uploadToken }
            : item,
        ),
      );
    } catch {
      setDrafts((current) =>
        current.map((item) =>
          item.id === draft.id
            ? { ...item, status: "failed", uploadToken: undefined }
            : item,
        ),
      );
    } finally {
      uploading.current.delete(draft.id);
    }
  }

  function add(type: v1.scooters.ScooterDocumentType, files: File[]) {
    const items: DocumentDraft[] = files.map((file) => ({
      id: crypto.randomUUID(),
      type,
      file,
      status: "uploading",
    }));
    setDrafts((current) => [...current, ...items]);
    for (const item of items) void upload(item);
  }

  return {
    drafts,
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
    blocked: drafts.some((item) => item.status !== "ready"),
    changed: drafts.length > 0 || removedIds.length > 0,
    payload: {
      ...(drafts.length
        ? {
            documentDrafts: drafts
              .filter((item) => item.status === "ready")
              .map((item) => ({
                type: item.type,
                fileName: item.file.name,
                uploadToken: item.uploadToken!,
              })),
          }
        : {}),
      ...(removedIds.length ? { removedDocumentIds: removedIds } : {}),
    },
  };
}
export type ScooterDocumentsEditor = ReturnType<typeof useScooterDocuments>;
