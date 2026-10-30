"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { aspectRatio } from "@repo/theme";
import { Button, FormSection } from "@repo/ui/components";
import { HorizontalScrollArea } from "@repo/ui/components/horizontal-scroll-area";
import { ImageViewer } from "@repo/ui/components/image-viewer";
import { useRemote } from "@/components/WorkspaceForm";
import { webApi } from "@/lib/api";

/** Read-only photo rail for persisted scooters; editing belongs in the editor. */
export function ScooterDetailPhotos({ scooterId }: { scooterId: string }) {
  const t = useTranslations("scooters.photos");
  const [activeId, setActiveId] = useState<string | null>(null);
  const load = useCallback(
    () =>
      webApi.fetch(
        v1.scooters.ROUTES.photos.list(scooterId),
        v1.scooters.scooterPhotoListSchema,
        { cache: "no-store" },
      ),
    [scooterId],
  );
  const remote = useRemote(load);
  const images = (remote.data ?? []).map((photo) => ({
    id: photo.id,
    src: webApi.url(photo.contentUrl),
    alt: photo.caption || photo.fileName,
    fileName: photo.fileName,
  }));

  return (
    <FormSection title={t("title")} columns={1} panel>
      {remote.loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("loading")}
        </p>
      ) : remote.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 text-sm text-destructive"
        >
          <span>{t("errors.load")}</span>
          <Button variant="outline" onClick={remote.reload}>
            {t("retry")}
          </Button>
        </div>
      ) : images.length ? (
        <HorizontalScrollArea
          label={t("title")}
          fadeEdges="always"
          fadeWidth="var(--card-spacing)"
          className="-mx-(--card-spacing) w-auto"
          snap
          scrollbarVisibility="desktop"
        >
          <ul className="flex w-max gap-3 px-(--card-spacing) py-1">
            {images.map((image) => (
              <li key={image.id} className="w-64 shrink-0 snap-start">
                <Button
                  variant="ghost"
                  className="h-auto w-full overflow-hidden rounded-xl p-0 md:p-0"
                  aria-label={t("open", { name: image.alt })}
                  aria-haspopup="dialog"
                  onClick={() => setActiveId(image.id)}
                >
                  {/* Authenticated API media is served without the public image optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.src}
                    alt={image.alt}
                    loading="lazy"
                    draggable={false}
                    style={{ aspectRatio: aspectRatio.scooterPhoto }}
                    className="block w-full bg-muted object-cover"
                  />
                </Button>
              </li>
            ))}
          </ul>
        </HorizontalScrollArea>
      ) : (
        <p className="text-sm text-muted-foreground">{t("emptyReadOnly")}</p>
      )}
      <ImageViewer
        open={activeId !== null}
        onOpenChange={(open) => {
          if (!open) setActiveId(null);
        }}
        activeId={activeId}
        onActiveIdChange={setActiveId}
        images={images}
        title={t("details")}
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
      />
    </FormSection>
  );
}
