"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { aspectRatio } from "@repo/theme";
import { Badge, Button, FormSection, Progress } from "@repo/ui/components";
import { ImageIcon, PlusIcon } from "lucide-react";
import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import { FileDropOverlay } from "@repo/ui/components/file-drop-overlay";
import { useFileDrop } from "@repo/ui/hooks/use-file-drop";
import { ImageGallery } from "@repo/ui/components/image-gallery";
import { useScooterPhotos } from "./useScooterPhotos";

export function ScooterPhotos({
  scooterId,
  panel = false,
  disabled = false,
  onBusyChange,
  number,
  onDraftsChange,
}: {
  scooterId?: string;
  panel?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  number?: number;
  onDraftsChange?: (
    drafts: v1.scooters.ScooterPhotoDraft[],
    blocked: boolean,
  ) => void;
}) {
  const user = useOptionalSession()?.user;
  if (!canAccess(user, scooterId ? "scooters.read" : "scooters.create", "ALL"))
    return null;
  return (
    <ScooterPhotoGallery
      key={scooterId ?? "draft"}
      scooterId={scooterId}
      panel={panel}
      disabled={disabled}
      editable={canAccess(
        user,
        scooterId ? "scooters.update" : "scooters.create",
        "ALL",
      )}
      onBusyChange={onBusyChange}
      number={number}
      onDraftsChange={onDraftsChange}
    />
  );
}

export function ScooterPhotoGallery({
  scooterId,
  panel = false,
  editable,
  disabled = false,
  onBusyChange,
  number,
  onDraftsChange,
}: {
  scooterId?: string;
  panel?: boolean;
  editable: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  number?: number;
  onDraftsChange?: (
    drafts: v1.scooters.ScooterPhotoDraft[],
    blocked: boolean,
  ) => void;
}) {
  const t = useTranslations("scooters.photos");
  const gallery = useScooterPhotos(scooterId);
  const [sortingBusy, setSortingBusy] = useState(false);
  useEffect(() => {
    onBusyChange?.(gallery.busy || sortingBusy);
    return () => onBusyChange?.(false);
  }, [gallery.busy, sortingBusy, onBusyChange]);
  useEffect(() => {
    onDraftsChange?.(gallery.drafts, gallery.blocked || sortingBusy);
  }, [gallery.drafts, gallery.blocked, sortingBusy, onDraftsChange]);
  const input = useRef<HTMLInputElement>(null);
  const busy = gallery.busy || disabled || sortingBusy;
  const photoCount = gallery.photos.length + gallery.uploads.length;
  const canUpload =
    editable && photoCount < v1.scooters.SCOOTER_PHOTO_MAX_FILES;

  const { dragging: filesOverGrid, handlers: fileDropHandlers } = useFileDrop({
    disabled: !canUpload || busy,
    onFiles: (files) => {
      void gallery.add(files);
    },
  });

  function uploadCard(label: string) {
    return (
      <button
        key={label}
        type="button"
        disabled={busy}
        style={{ aspectRatio: aspectRatio.scooterPhoto }}
        className="flex min-w-0 flex-col items-center justify-center gap-3 rounded-dashed-surface border-(length:--dashed-surface-border-width) border-dashed border-border bg-transparent p-4 text-center text-sm font-medium text-muted-foreground transition-colors duration-normal ease-standard enabled:hover:border-primary enabled:active:border-primary enabled:active:border-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => input.current?.click()}
      >
        <PlusIcon aria-hidden="true" className="size-6" />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <FormSection
      number={number}
      title={t("title")}
      columns={1}
      panel={panel}
      status={
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {t("count", { count: gallery.photos.length })}
        </span>
      }
    >
      <input
        ref={input}
        type="file"
        accept={v1.scooters.SCOOTER_PHOTO_CONTENT_TYPES.join(",")}
        multiple
        hidden
        aria-label={t("upload")}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void gallery.add(files);
        }}
      />
      <div className="grid min-w-0 gap-4">
        {gallery.error ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 text-sm text-destructive"
          >
            <span>{t(`errors.${gallery.error}`)}</span>
            {gallery.error === "load" || gallery.error === "save" ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void gallery.load()}
              >
                {t("retry")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {gallery.loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("loading")}
          </p>
        ) : null}
        {!gallery.loading && gallery.error !== "load" ? (
          <>
            <div className="relative" {...fileDropHandlers}>
              <ImageGallery
                images={gallery.photos.map((photo) => ({
                  id: photo.id,
                  src: scooterId
                    ? webApi.url(photo.contentUrl)
                    : photo.contentUrl,
                  alt: photo.caption || photo.fileName,
                  fileName: photo.fileName,
                }))}
                labels={{
                  close: t("close"),
                  previous: t("previous"),
                  next: t("next"),
                  grid: t("grid"),
                  zoomIn: t("zoomIn"),
                  zoomOut: t("zoomOut"),
                  resetZoom: t("resetZoom"),
                  loading: t("imageLoading"),
                  error: t("imageFailed"),
                  retry: t("retry"),
                  position: (index, count) => t("position", { index, count }),
                }}
                title={t("details")}
                items={gallery.photos}
                className="grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-3"
                disabled={
                  !editable ||
                  gallery.busy ||
                  disabled ||
                  gallery.uploads.length > 0
                }
                instructions={t("sortInstructions")}
                getItemLabel={(photo) =>
                  t("open", { name: photo.caption || photo.fileName })
                }
                removal={
                  editable
                    ? {
                        label: t("deleteDrop"),
                        activeLabel: t("deleteDropActive"),
                        onRemove: (photo) => gallery.remove(photo.id),
                      }
                    : undefined
                }
                onOrderChange={gallery.reorder}
                onInteractionChange={setSortingBusy}
                renderItem={(photo) => (
                  <div className="relative isolate overflow-hidden">
                    <PhotoImage
                      src={
                        scooterId
                          ? webApi.url(photo.contentUrl)
                          : photo.contentUrl
                      }
                      alt={photo.caption || photo.fileName}
                    />
                    <div className="pointer-events-none absolute inset-x-3 bottom-3">
                      <PhotoBadges photo={photo} overlay />
                    </div>
                  </div>
                )}
              >
                {!photoCount && canUpload ? uploadCard(t("cover")) : null}
                {gallery.uploads.map((upload) => (
                  <div
                    key={upload.id}
                    data-slot="photo-upload-preview"
                    style={{ aspectRatio: aspectRatio.scooterPhoto }}
                    className="relative min-w-0 overflow-hidden rounded-xl border border-border bg-control"
                  >
                    <div className="absolute inset-0">
                      <PhotoImage src={upload.preview} alt={upload.file.name} />
                    </div>
                    <div
                      data-slot="photo-upload-overlay"
                      className="absolute inset-2 flex min-h-0 flex-col justify-end"
                    >
                      <div className="grid min-h-0 gap-2 overflow-y-auto rounded-lg bg-document-overlay p-2 text-foreground">
                        <p className="truncate text-sm font-medium">
                          {upload.file.name}
                        </p>
                        {upload.status === "uploading" ? (
                          <>
                            <p
                              role="status"
                              className="text-xs text-muted-foreground"
                            >
                              {t(
                                upload.progress === 100
                                  ? "processing"
                                  : "uploading",
                                { progress: upload.progress },
                              )}
                            </p>
                            <Progress
                              value={upload.progress}
                              aria-label={t("uploading", {
                                progress: upload.progress,
                              })}
                            />
                          </>
                        ) : (
                          <>
                            <p
                              role="alert"
                              className="text-xs text-destructive"
                            >
                              {t("uploadFailed")}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void gallery.retry(upload)}
                              >
                                {t("retry")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => gallery.discard(upload)}
                              >
                                {t("remove")}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {canUpload && photoCount > 0
                  ? uploadCard(t("addPhotos"))
                  : null}
              </ImageGallery>
              {filesOverGrid && canUpload && !busy ? (
                <FileDropOverlay
                  label={t("dropOverlay")}
                  icon={<ImageIcon aria-hidden="true" className="size-8" />}
                />
              ) : null}
            </div>
            {!editable && !photoCount ? (
              <p className="text-sm text-muted-foreground">
                {t("emptyReadOnly")}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </FormSection>
  );
}

function PhotoBadges({
  photo,
  overlay = false,
}: {
  photo: v1.scooters.ScooterPhoto;
  overlay?: boolean;
}) {
  const t = useTranslations("scooters.photos");
  return (
    <div className="flex flex-wrap gap-1">
      <Badge
        variant="outline"
        className={overlay ? "bg-popover text-popover-foreground" : undefined}
      >
        {t(photo.isPublic ? "public" : "internal")}
      </Badge>
      {photo.type === "GALLERY_COVER" ? (
        <Badge variant="secondary">{t("coverBadge")}</Badge>
      ) : null}
    </div>
  );
}

function PhotoImage({ src, alt }: { src: string; alt: string }) {
  const t = useTranslations("scooters.photos");
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const style = { aspectRatio: aspectRatio.scooterPhoto };
  if (failedSrc === src)
    return (
      <div
        style={style}
        className={`grid w-full place-content-center gap-2 bg-muted p-4 text-center text-sm text-muted-foreground`}
      >
        <ImageIcon aria-hidden="true" className="mx-auto size-6" />
        <span>{t("imageFailed")}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setFailedSrc(null)}
        >
          {t("retry")}
        </Button>
      </div>
    );
  // Authenticated API media and temporary blob previews are served without a public optimizer.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      draggable={false}
      loading="lazy"
      style={style}
      className="block w-full bg-muted object-cover"
      onError={() => setFailedSrc(src)}
    />
  );
}
