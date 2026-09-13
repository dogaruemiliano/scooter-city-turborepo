"use client";

import { Button, Spinner } from "@repo/ui/components";
import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DocumentExtractionJob } from "./useDocumentExtraction";

/** Sits over the photo, outside its preview button so retry remains independent. */
export function DocumentExtractionFeedback({
  id,
  job,
  error,
  disabled,
  onRetry,
  retryLabel,
}: {
  id: string;
  job?: DocumentExtractionJob;
  error?: string | null;
  disabled: boolean;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const t = useTranslations("persons");
  if (!error && job?.status === "pending") {
    return (
      <div className="pointer-events-none absolute right-2 bottom-2 left-2 flex justify-end">
        <span
          id={id}
          role="status"
          className="flex min-w-0 items-center gap-2 rounded-md bg-media-scrim px-3 py-2 text-sm text-scrim-foreground"
        >
          <Spinner className="shrink-0" />
          {t("extraction.readingDocument")}
        </span>
      </div>
    );
  }

  const isError = Boolean(error) || job?.status === "error";
  const warnings = [...new Set(job?.warnings ?? [])];
  const messages = error
    ? [error]
    : job?.status === "error" || job?.status === "disabled"
      ? [t(`extraction.status.${job.status}`)]
      : job?.status === "success"
        ? warnings.map((warning) => t(`extraction.warnings.${warning}`))
        : [];
  if (!messages.length) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-12 bottom-0 flex items-end p-2">
      <div
        id={id}
        role={isError ? "alert" : "status"}
        className="pointer-events-auto grid max-h-full w-full gap-2 overflow-y-auto rounded-md bg-media-scrim p-3 text-sm text-scrim-foreground"
      >
        <div className="flex items-start gap-2">
          <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
          <div className="grid min-w-0 gap-2">
            {messages.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        </div>
        {onRetry && job?.status !== "disabled" ? (
          <Button
            type="button"
            variant="text"
            className="justify-self-start text-scrim-foreground underline hover:text-scrim-foreground"
            disabled={disabled}
            onClick={onRetry}
          >
            {retryLabel ?? t("extraction.retry")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
