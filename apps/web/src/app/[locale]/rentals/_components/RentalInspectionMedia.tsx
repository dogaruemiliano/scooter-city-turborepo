"use client";

import { useCallback, useRef, useState } from "react";
import { v1 } from "@repo/api-shared";
import { Checkbox, Field, FieldLabel, Input } from "@repo/ui/components";
import { SaveButton } from "@repo/ui/components/save-button";
import { DocumentPreview } from "@repo/ui/components/document-preview";
import { useTranslations } from "next-intl";
import {
  Feedback,
  RemoteState,
  useRemote,
  useTask,
} from "@/components/WorkspaceForm";
import { webApi } from "@/lib/api";
import { useFormAction } from "@/lib/form/use-form-action";

const mediaSchema = v1.rentals.rentalMediaSchema;
const mediaListSchema = v1.rentals.rentalMediaListSchema;

/** Rental evidence is private and remains separate from the public scooter gallery. */
export function RentalInspectionMedia({
  rentalId,
  eventType,
  value,
  onChange,
  disabled,
  onBusyChange,
}: {
  rentalId: string;
  eventType: "handover" | "return";
  value: readonly string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const t = useTranslations("contracts");
  const photos = useTranslations("scooters.photos");
  const action = useFormAction();
  const task = useTask();
  const [file, setFile] = useState<File | null>(null);
  const [opened, open] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(
    () =>
      webApi.fetch(
        `/v1/rentals/${rentalId}/media?eventType=${eventType}`,
        mediaListSchema,
        { cache: "no-store" },
      ),
    [rentalId, eventType],
  );
  const remote = useRemote(load);
  async function upload() {
    if (!file || disabled || task.busy) return;
    onBusyChange(true);
    try {
      await task.run(async () => {
        const body = new FormData();
        body.set("file", file);
        body.set("eventType", eventType);
        const saved = await webApi.fetch(
          `/v1/rentals/${rentalId}/media`,
          mediaSchema,
          { method: "POST", body },
        );
        onChange([...new Set([...value, saved.id])]);
        setFile(null);
        if (input.current) input.current.value = "";
        remote.reload();
      });
    } finally {
      onBusyChange(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold">{t("media")}</h3>
      <p className="text-sm text-muted-foreground">{t("mediaHint")}</p>
      <Field>
        <FieldLabel htmlFor={`rental-media-${rentalId}-${eventType}`}>
          {photos("upload")}
        </FieldLabel>
        <Input
          ref={input}
          id={`rental-media-${rentalId}-${eventType}`}
          type="file"
          accept={v1.scooters.SCOOTER_PHOTO_CONTENT_TYPES.join(",")}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={disabled || task.busy}
        />
      </Field>
      <SaveButton
        type="button"
        disabled={!file || disabled}
        {...action(
          "create",
          { pending: task.busy, error: task.error },
          photos("upload"),
        )}
        onClick={() => void upload()}
      />
      <Feedback error={task.error} />
      {!remote.data ? (
        <RemoteState error={remote.error} retry={remote.reload} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {remote.data.items.map((media) => (
            <div key={media.id} className="flex flex-col gap-3">
              <DocumentPreview
                src={webApi.url(
                  `/v1/rentals/${rentalId}/media/${media.id}/content`,
                )}
                contentType={media.contentType}
                fileName={media.fileName}
                label={media.fileName}
                triggerLabel={photos("open", { name: media.fileName })}
                imageAlt={media.fileName}
                title={t("media")}
                closeLabel={photos("close")}
                openFileLabel={t("download")}
                actionsLabel={photos("details")}
                pdfLabels={{
                  error: photos("imageFailed"),
                  previousPage: t("previousPage"),
                  nextPage: t("nextPage"),
                }}
                zoomLabels={{
                  zoomIn: photos("zoomIn"),
                  zoomOut: photos("zoomOut"),
                  resetZoom: photos("resetZoom"),
                }}
                open={opened === media.id}
                onOpenChange={(next) => open(next ? media.id : null)}
              />
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={value.includes(media.id)}
                  disabled={disabled || task.busy}
                  onCheckedChange={(next) =>
                    onChange(
                      next === true
                        ? [...new Set([...value, media.id])]
                        : value.filter((id) => id !== media.id),
                    )
                  }
                />
                {t("includeMedia")}
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
