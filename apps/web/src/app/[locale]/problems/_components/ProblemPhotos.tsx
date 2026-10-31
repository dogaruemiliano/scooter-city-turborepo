"use client";
import { useFormAction } from "@/lib/form/use-form-action";
import { SaveButton } from "@repo/ui/components/save-button";

import { useEffect, useRef, useState } from "react";
import { v1 } from "@repo/api-shared";
import { aspectRatio } from "@repo/theme";
import { AddAction, Button } from "@repo/ui/components";
import { ImageGallery } from "@repo/ui/components/image-gallery";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { webApi } from "@/lib/api";
import { Feedback, useTask } from "@/components/WorkspaceForm";

type PendingPhoto = { id: string; file: File; src: string };

export function ProblemPhotos({
  problem,
  editable,
  disabled,
  onSave,
  onBusyChange,
  onReload,
}: {
  problem: v1.problems.Problem;
  editable: boolean;
  disabled: boolean;
  onSave: (photos: v1.problems.ProblemPhotoDraft[]) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onReload?: () => Promise<void>;
}) {
  const formAction = useFormAction();

  const t = useTranslations("workspace.problems");
  const galleryT = useTranslations("scooters.photos");
  const task = useTask();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const pendingRef = useRef(pending);
  const previews = useRef(new Set<string>());
  const uploads = useRef(new Map<File, v1.problems.ProblemPhotoDraft>());
  const [error, setError] = useState<string | null>(null);
  const count = problem.photos.length + pending.length;
  const busy = disabled || task.busy;
  useEffect(() => {
    onBusyChange(task.busy);
    return () => onBusyChange(false);
  }, [task.busy, onBusyChange]);
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  function add(files: File[]) {
    if (
      problem.photos.length + pendingRef.current.length + files.length >
        v1.problems.PROBLEM_PHOTO_MAX_FILES ||
      files.some(
        (file) =>
          !v1.scooters.SCOOTER_PHOTO_CONTENT_TYPES.includes(
            file.type as (typeof v1.scooters.SCOOTER_PHOTO_CONTENT_TYPES)[number],
          ) ||
          !file.size ||
          file.size > v1.scooters.SCOOTER_PHOTO_MAX_BYTES,
      )
    ) {
      const message = t("photoLimits");
      setError(message);
      throw new Error(message);
    }
    const next = files.map((file) => {
      const src = URL.createObjectURL(file);
      previews.current.add(src);
      return { id: crypto.randomUUID(), file, src };
    });
    pendingRef.current = [...pendingRef.current, ...next];
    setPending(pendingRef.current);
    setError(null);
  }

  const images = [
    ...problem.photos.map((photo) => ({
      id: photo.id,
      src: webApi.url(photo.contentUrl),
      alt: photo.fileName,
      fileName: photo.fileName,
    })),
    ...pending.map((photo) => ({
      id: photo.id,
      src: photo.src,
      alt: photo.file.name,
      fileName: photo.file.name,
    })),
  ];
  return (
    <section className="flex flex-col gap-3" aria-label={t("attachments")}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {t("attachments")}
        </h3>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {t("attachmentCount", { count })}
        </span>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/*"
        aria-label={t("choosePhotos")}
        disabled={busy}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (!files.length) return;
          try {
            add(files);
          } catch {
            /* The validation message is displayed beside the photos. */
          }
        }}
      />
      <ImageGallery
        items={images}
        images={images}
        title={t("attachments")}
        disabled
        instructions={galleryT("sortInstructions")}
        onOrderChange={async () => false}
        getItemLabel={(photo) => galleryT("open", { name: photo.fileName })}
        renderItem={(photo) => (
          // Authenticated API images and local previews retain their original URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.src}
            alt={photo.alt}
            loading="lazy"
            draggable={false}
            style={{ aspectRatio: aspectRatio.scooterPhoto }}
            className="block w-full bg-muted object-cover"
          />
        )}
        labels={{
          close: galleryT("close"),
          previous: galleryT("previous"),
          next: galleryT("next"),
          grid: galleryT("grid"),
          zoomIn: galleryT("zoomIn"),
          zoomOut: galleryT("zoomOut"),
          resetZoom: galleryT("resetZoom"),
          loading: galleryT("imageLoading"),
          error: galleryT("imageFailed"),
          retry: galleryT("retry"),
          position: (index, count) => galleryT("position", { index, count }),
        }}
      >
        {editable && count < v1.problems.PROBLEM_PHOTO_MAX_FILES ? (
          <AddAction
            text={t("choosePhotos")}
            icon={<Plus />}
            style={{ aspectRatio: aspectRatio.scooterPhoto }}
            disabled={busy}
            onClick={() => input.current?.click()}
          />
        ) : null}
      </ImageGallery>
      {editable ? (
        <>
          <div className="flex flex-wrap gap-2">
            {pending.length ? (
              <SaveButton
                disabled={busy}
                onClick={() =>
                  void task.run(async () => {
                    const drafts: v1.problems.ProblemPhotoDraft[] = [];
                    for (const { file } of pending) {
                      let draft = uploads.current.get(file);
                      if (!draft) {
                        const digest = await crypto.subtle.digest(
                          "SHA-256",
                          await file.arrayBuffer(),
                        );
                        const checksumSha256 = [...new Uint8Array(digest)]
                          .map((byte) => byte.toString(16).padStart(2, "0"))
                          .join("");
                        const upload = await webApi.fetch(
                          `/v1/problems/${problem.id}/photo-upload-url`,
                          v1.problems.problemPhotoUploadSchema,
                          {
                            method: "POST",
                            json: v1.problems.createProblemPhotoUploadSchema.parse(
                              {
                                contentType: file.type,
                                byteSize: file.size,
                                checksumSha256,
                              },
                            ),
                          },
                        );
                        const response = await fetch(upload.uploadUrl, {
                          method: "PUT",
                          headers: upload.headers,
                          body: file,
                          credentials: "omit",
                        });
                        if (!response.ok) throw new Error(t("photoFailed"));
                        draft = {
                          uploadToken: upload.uploadToken,
                          fileName: file.name,
                        };
                        uploads.current.set(file, draft);
                      }
                      drafts.push(draft);
                    }
                    await onSave(drafts);
                    for (const photo of pending) {
                      URL.revokeObjectURL(photo.src);
                      previews.current.delete(photo.src);
                    }
                    uploads.current.clear();
                    pendingRef.current = [];
                    setPending([]);
                  })
                }
                {...formAction(
                  "save",
                  { pending: busy, error: task.error },
                  t("savePhotos"),
                )}
              />
            ) : null}
          </div>
          {pending.map((photo) => (
            <div
              key={photo.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="min-w-0 wrap-anywhere">{photo.file.name}</span>
              <Button
                variant="ghost"
                disabled={busy}
                aria-label={`${t("removePhoto")}: ${photo.file.name}`}
                onClick={() => {
                  URL.revokeObjectURL(photo.src);
                  previews.current.delete(photo.src);
                  uploads.current.delete(photo.file);
                  pendingRef.current = pendingRef.current.filter(
                    (item) => item.id !== photo.id,
                  );
                  setPending(pendingRef.current);
                }}
              >
                {t("removePhoto")}
              </Button>
            </div>
          ))}
        </>
      ) : !count ? (
        <p className="text-sm text-muted-foreground">{galleryT("empty")}</p>
      ) : null}
      <Feedback error={error ?? task.error} />
      {task.error && onReload ? (
        <Button
          variant="outline"
          className="self-start"
          disabled={busy}
          onClick={() => void task.run(onReload)}
        >
          {galleryT("retry")}
        </Button>
      ) : null}
    </section>
  );
}
