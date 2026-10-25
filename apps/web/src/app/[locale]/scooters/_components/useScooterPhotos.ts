"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, v1 } from "@repo/api-shared";
import { webApi } from "@/lib/api";

export interface PhotoUpload {
  id: string;
  file: File;
  preview: string;
  status: "uploading" | "failed";
  progress: number;
  uploadToken?: string;
  fileUnavailable?: boolean;
}

function putPhoto(
  upload: { uploadUrl: string; headers: Record<string, string> },
  file: File,
  progress: (value: number) => void,
  signal: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    request.open("PUT", upload.uploadUrl);
    request.timeout = 120_000;
    for (const [key, value] of Object.entries(upload.headers))
      request.setRequestHeader(key, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("Upload failed"));
    request.onerror =
      request.ontimeout =
      request.onabort =
        () => reject(new Error("Upload failed"));
    request.onloadend = () => signal.removeEventListener("abort", abort);
    if (signal.aborted) {
      reject(new Error("Upload cancelled"));
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    request.send(file);
  });
}

export interface ScooterPhotosSnapshot {
  photos: (Omit<v1.scooters.ScooterPhoto, "contentUrl"> & {
    uploadToken: string;
  })[];
  uploads: (Omit<PhotoUpload, "file" | "preview"> & {
    file: { name: string; type: string; size: number; lastModified: number };
  })[];
}

function restorePhotoUpload(
  upload: ScooterPhotosSnapshot["uploads"][number],
): PhotoUpload {
  const file = new File([], upload.file.name, {
    type: upload.file.type,
    lastModified: upload.file.lastModified,
  });
  Object.defineProperty(file, "size", { value: upload.file.size });
  return {
    ...upload,
    file,
    preview: "",
    fileUnavailable: true,
    status: "failed",
  };
}

export function useScooterPhotos(
  scooterId?: string,
  onSaved?: () => void,
  options: { snapshot?: ScooterPhotosSnapshot; importDraftId?: string } = {},
) {
  const [photos, setPhotos] = useState<
    (v1.scooters.ScooterPhoto & { uploadToken?: string })[]
  >(
    () =>
      options.snapshot?.photos.map((photo) => ({ ...photo, contentUrl: "" })) ??
      [],
  );
  const [uploads, setUploads] = useState<PhotoUpload[]>(
    () => options.snapshot?.uploads.map(restorePhotoUpload) ?? [],
  );
  const [loading, setLoading] = useState(Boolean(scooterId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<
    "load" | "save" | "files" | "preview" | null
  >(null);
  const operation = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const previews = useRef(new Set<string>());

  const importDraftId = options.importDraftId;
  const restoredPhotos = useRef(options.snapshot?.photos ?? []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!scooterId) {
        if (!importDraftId) return;
        const results = await Promise.allSettled(
          restoredPhotos.current.map(async (photo) => {
            const response = await fetch(
              webApi.url(
                `/v1/scooters/import-drafts/${encodeURIComponent(importDraftId)}/photo-content`,
              ),
              {
                method: "POST",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                  "X-Requested-With": "fetch",
                },
                body: JSON.stringify({ uploadToken: photo.uploadToken }),
                signal,
              },
            );
            if (!response.ok) throw new Error("Photo preview unavailable");
            const url = URL.createObjectURL(await response.blob());
            if (signal?.aborted) {
              URL.revokeObjectURL(url);
              return;
            }
            previews.current.add(url);
            setPhotos((items) =>
              items.map((item) =>
                item.id === photo.id ? { ...item, contentUrl: url } : item,
              ),
            );
          }),
        );
        if (!signal?.aborted)
          setError(
            results.some((result) => result.status === "rejected")
              ? "preview"
              : null,
          );
        return;
      }
      try {
        const result = await webApi.fetch(
          v1.scooters.ROUTES.photos.list(scooterId),
          v1.scooters.scooterPhotoListSchema,
          { signal },
        );
        if (!signal?.aborted) {
          setPhotos(result);
          setError(null);
        }
      } catch {
        if (!signal?.aborted) setError("load");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [scooterId, importDraftId],
  );

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    queueMicrotask(() => {
      if (!abort.signal.aborted) void load(abort.signal);
    });
    const urls = previews.current;
    return () => {
      abort.abort();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, [load]);

  function discard(upload: PhotoUpload) {
    URL.revokeObjectURL(upload.preview);
    previews.current.delete(upload.preview);
    setUploads((items) => items.filter((item) => item.id !== upload.id));
  }

  async function uploadOne(item: PhotoUpload) {
    if (item.fileUnavailable && !item.uploadToken) return;
    const signal = controller.current!.signal;
    const patch = (fields: Partial<PhotoUpload>) => {
      if (!signal.aborted)
        setUploads((items) =>
          items.map((entry) =>
            entry.id === item.id ? { ...entry, ...fields } : entry,
          ),
        );
    };
    patch({ status: "uploading", progress: 0 });
    try {
      let uploadToken = item.uploadToken;
      if (!uploadToken) {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          await item.file.arrayBuffer(),
        );
        const checksumSha256 = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        const upload = await webApi.fetch(
          scooterId
            ? v1.scooters.ROUTES.photos.upload(scooterId)
            : v1.scooters.ROUTES.photos.draftUpload,
          v1.scooters.scooterPhotoUploadSchema,
          {
            method: "POST",
            signal,
            json: {
              contentType: item.file.type,
              byteSize: item.file.size,
              checksumSha256,
            },
          },
        );
        if (item.file.size > upload.maxBytes) throw new Error("File too large");
        await putPhoto(
          upload,
          item.file,
          (progress) => patch({ progress }),
          signal,
        );
        uploadToken = upload.uploadToken;
        patch({ uploadToken, progress: 100 });
      }
      if (!scooterId) {
        if (!signal.aborted) {
          setPhotos((current) => [
            ...current,
            {
              id: item.id,
              uploadToken,
              fileName: item.file.name,
              caption: null,
              isPublic: false,
              type: current.length === 0 ? "GALLERY_COVER" : "GALLERY",
              position: current.length,
              contentUrl: item.preview,
              createdAt: new Date().toISOString(),
            },
          ]);
          if (item.fileUnavailable && uploadToken) {
            restoredPhotos.current = [
              ...restoredPhotos.current,
              {
                id: item.id,
                uploadToken,
                fileName: item.file.name,
                caption: null,
                isPublic: false,
                type: "GALLERY",
                position: photos.length,
                createdAt: new Date().toISOString(),
              },
            ];
            void load(signal);
          }
          setUploads((current) =>
            current.filter((entry) => entry.id !== item.id),
          );
        }
        return;
      }
      const result = await webApi.fetch(
        v1.scooters.ROUTES.photos.list(scooterId),
        v1.scooters.scooterPhotoListSchema,
        {
          method: "POST",
          signal,
          json: { uploadToken, fileName: item.file.name },
        },
      );
      if (!signal.aborted) {
        setPhotos(result);
        discard(item);
        onSaved?.();
      }
    } catch (error) {
      patch({
        status: "failed",
        ...(error instanceof ApiError &&
        (error.status === 400 || error.status === 410)
          ? { uploadToken: undefined }
          : {}),
      });
    }
  }

  async function add(files: File[]) {
    if (operation.current || loading || error === "load") return;
    if (
      photos.length + uploads.length + files.length >
        v1.scooters.SCOOTER_PHOTO_MAX_FILES ||
      files.some(
        (file) =>
          !(
            v1.scooters.SCOOTER_PHOTO_CONTENT_TYPES as readonly string[]
          ).includes(file.type) ||
          file.size === 0 ||
          file.size > v1.scooters.SCOOTER_PHOTO_MAX_BYTES,
      )
    ) {
      setError("files");
      return;
    }
    operation.current = true;
    setBusy(true);
    setError(null);
    const items: PhotoUpload[] = files.map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return {
        id: crypto.randomUUID(),
        file,
        preview,
        status: "uploading",
        progress: 0,
      };
    });
    setUploads((current) => [...current, ...items]);
    try {
      for (const item of items) {
        if (controller.current?.signal.aborted) break;
        await uploadOne(item);
      }
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function retry(item: PhotoUpload) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      await uploadOne(item);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function mutate(
    path: string,
    method: "PATCH" | "DELETE",
    json?: unknown,
  ) {
    if (operation.current) return false;
    operation.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await webApi.fetch(
        path,
        v1.scooters.scooterPhotoListSchema,
        { method, json, signal: controller.current?.signal },
      );
      if (!controller.current?.signal.aborted) {
        setPhotos(result);
        onSaved?.();
      }
      return true;
    } catch {
      if (!controller.current?.signal.aborted) setError("save");
      return false;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  const drafts = useMemo(
    () =>
      photos.flatMap((photo) =>
        photo.uploadToken
          ? [
              {
                uploadToken: photo.uploadToken,
                fileName: photo.fileName,
                caption: photo.caption,
                isPublic: photo.isPublic,
                type: photo.type,
              },
            ]
          : [],
      ),
    [photos],
  );

  return {
    getSnapshot: (): ScooterPhotosSnapshot => ({
      photos: photos.flatMap((photo) =>
        photo.uploadToken
          ? [
              {
                id: photo.id,
                uploadToken: photo.uploadToken,
                fileName: photo.fileName,
                caption: photo.caption,
                isPublic: photo.isPublic,
                type: photo.type,
                position: photo.position,
                createdAt: photo.createdAt,
              },
            ]
          : [],
      ),
      uploads: uploads.map(({ file, ...upload }) => ({
        id: upload.id,
        status: upload.status,
        uploadToken: upload.uploadToken,
        fileUnavailable: upload.fileUnavailable,
        progress: 0,
        file: {
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
        },
      })),
    }),
    drafts,
    blocked: busy || uploads.length > 0,
    photos,
    uploads,
    loading,
    busy,
    error,
    load: () => {
      setLoading(true);
      setError(null);
      return load(controller.current?.signal).finally(() => setLoading(false));
    },
    add,
    retry,
    discard,
    update: async (photoId: string, input: v1.scooters.UpdateScooterPhoto) => {
      if (scooterId)
        return mutate(
          v1.scooters.ROUTES.photos.photo(scooterId, photoId),
          "PATCH",
          input,
        );
      if (operation.current) return false;
      setPhotos((current) =>
        current.map((photo) => {
          if (photo.id === photoId) return { ...photo, ...input };
          return {
            ...photo,
            type:
              input.type === "GALLERY_COVER" && photo.type === "GALLERY_COVER"
                ? "GALLERY"
                : photo.type,
          };
        }),
      );
      return true;
    },
    remove: async (photoId: string) => {
      if (scooterId)
        return mutate(
          v1.scooters.ROUTES.photos.photo(scooterId, photoId),
          "DELETE",
        );
      if (operation.current) return false;
      const removed = photos.find((photo) => photo.id === photoId);
      if (removed) {
        URL.revokeObjectURL(removed.contentUrl);
        previews.current.delete(removed.contentUrl);
      }
      setPhotos((current) => {
        const remaining = current.filter((photo) => photo.id !== photoId);
        return remaining.map((photo, position) => ({
          ...photo,
          position,
          type:
            removed?.type === "GALLERY_COVER"
              ? position === 0
                ? "GALLERY_COVER"
                : "GALLERY"
              : photo.type,
        }));
      });
      return true;
    },
    reorder: async (photoIds: string[]) => {
      if (scooterId)
        return mutate(v1.scooters.ROUTES.photos.reorder(scooterId), "PATCH", {
          photoIds,
        });
      if (operation.current) return false;
      setPhotos((current) =>
        photoIds.map((id, position) => ({
          ...current.find((photo) => photo.id === id)!,
          position,
        })),
      );
      return true;
    },
  };
}
