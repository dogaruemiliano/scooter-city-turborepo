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
  useEffect(() => {
    onBusyChange?.(gallery.busy);
    return () => onBusyChange?.(false);
  }, [gallery.busy, onBusyChange]);
  useEffect(() => {
    onDraftsChange?.(gallery.drafts, gallery.blocked);
  }, [gallery.drafts, gallery.blocked, onDraftsChange]);
  const input = useRef<HTMLInputElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const busy = gallery.busy || disabled;
  const photoCount = gallery.photos.length + gallery.uploads.length;
  const canUpload =
    editable && photoCount < v1.scooters.SCOOTER_PHOTO_MAX_FILES;

  function uploadCard(label: string, cover = false) {
    return (
      <button
        key={label}
        type="button"
        disabled={busy}
        style={{ aspectRatio: aspectRatio.scooterPhoto }}
        className="flex min-w-0 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-transparent p-4 text-center text-sm font-medium text-muted-foreground transition-colors duration-normal ease-standard enabled:hover:border-primary enabled:active:border-primary enabled:active:border-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          if (!input.current) return;
          input.current.multiple = !cover;
          input.current.click();
        }}
        onDragOver={(event) => {
          if (!busy && event.dataTransfer.types.includes("Files"))
            event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (busy) return;
          const files = Array.from(event.dataTransfer.files);
          if (files.length) void gallery.add(cover ? files.slice(0, 1) : files);
        }}
      >
        <PlusIcon aria-hidden="true" className="size-6" />
        <span>{label}</span>
      </button>
    );
  }

  function move(photoId: string, targetId: string) {
    if (busy || photoId === targetId) return;
    const ids = gallery.photos.map((photo) => photo.id);
    const from = ids.indexOf(photoId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, photoId);
    void gallery.reorder(ids);
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
            <div className="grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-3">
              {!photoCount && canUpload ? uploadCard(t("cover"), true) : null}
              {gallery.photos.map((photo) => (
                <div
                  key={photo.id}
                  className="group min-w-0 overflow-hidden rounded-xl border border-border bg-control"
                  draggable={editable && !busy}
                  onDragStart={(event) => {
                    setDraggedId(photo.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDraggedId(null)}
                  onDragOver={(event) => {
                    if (draggedId && !busy) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedId && !busy) move(draggedId, photo.id);
                    setDraggedId(null);
                  }}
                >
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
                </div>
              ))}
              {gallery.uploads.map((upload) => (
                <div
                  key={upload.id}
                  className="min-w-0 overflow-hidden rounded-xl border border-border bg-control"
                >
                  <PhotoImage src={upload.preview} alt={upload.file.name} />
                  <div className="grid gap-2 p-3">
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
                        <p role="alert" className="text-xs text-destructive">
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
              ))}
              {canUpload && photoCount > 0 ? uploadCard(t("addPhotos")) : null}
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
        {t(photo.showToCustomers ? "selectedForCustomers" : "internal")}
      </Badge>
      {photo.internalCover ? (
        <Badge variant="secondary">{t("internalCover")}</Badge>
      ) : null}
      {photo.customerCover ? (
        <Badge variant="secondary">{t("customerCover")}</Badge>
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
