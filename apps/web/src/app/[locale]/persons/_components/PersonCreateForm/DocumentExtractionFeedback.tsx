"use client";

import { Button } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import {
  documentExtractionSignature,
  type DocumentExtractionJob,
} from "./useDocumentExtraction";
import type { CreatePersonFormState } from "./types";

export function DocumentExtractionFeedback({
  form,
  jobs,
  pending,
  disabled,
  onRetry,
  onManual,
}: {
  form: CreatePersonFormState;
  jobs: Record<string, DocumentExtractionJob>;
  pending: boolean;
  disabled: boolean;
  onRetry: (key: string) => void;
  onManual: () => void;
}) {
  const t = useTranslations("persons");
  const documents = form.documents.filter((document) =>
    documentExtractionSignature(document),
  );
  if (!documents.length) return null;
  return (
    <section
      aria-label={t("extraction.title")}
      className="grid gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground"
    >
      <div className="grid gap-3" aria-live="polite">
        {documents.map((document) => {
          const job = jobs[document.key];
          const status =
            job?.signature === documentExtractionSignature(document)
              ? job.status
              : "pending";
          return (
            <div key={document.key} className="grid gap-1">
              <p className="text-sm font-medium">
                {t(`documentTypes.${document.type}`)}
              </p>
              <p className="text-sm text-muted-foreground">
                {t(`extraction.status.${status}`)}
              </p>
              {status === "success"
                ? job?.warnings?.map((warning) => (
                    <p className="text-sm text-muted-foreground" key={warning}>
                      {t(`extraction.warnings.${warning}`)}
                    </p>
                  ))
                : null}
              {status === "error" || status === "manual" ? (
                <Button
                  type="button"
                  variant="text"
                  className="justify-self-start"
                  disabled={disabled}
                  onClick={() => onRetry(document.key)}
                >
                  {t("extraction.retry")}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      {pending ? (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={disabled}
          onClick={onManual}
        >
          {t("extraction.continueManually")}
        </Button>
      ) : null}
    </section>
  );
}
