"use client";

import { BottomSheetTrigger, Button } from "@repo/ui/components";
import { ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { PERSON_DOCUMENT_FORM_FIELD_KEYS } from "./constants";
import { documentFieldErrorKey, invalidAria } from "./errors";
import { DocumentReviewSummary } from "./DocumentReviewSummary";
import { isBlankDocumentDraft } from "./form-state";
import type { CreatePersonDocumentFormState, FormErrors } from "./types";

export function DocumentDraftCard({
  document,
  documentId,
  locale,
  disabled,
  fieldErrors,
  onOpen,
}: {
  document: CreatePersonDocumentFormState;
  documentId: string;
  locale: string;
  disabled: boolean;
  fieldErrors: FormErrors;
  onOpen: () => void;
}) {
  const t = useTranslations("persons");
  const isBlank = isBlankDocumentDraft(document);
  const typeLabel = t(`documentTypes.${document.type}`);
  const actionLabel = isBlank
    ? t("documentForm.addDocument", { document: typeLabel })
    : t("documentForm.editDocument", { document: typeLabel });
  const error = firstDocumentError(document.key, fieldErrors);
  const errorId = `${documentId}-summary-error`;

  return (
    <article
      aria-label={typeLabel}
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground"
    >
      <BottomSheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full items-center justify-between rounded-none p-4 text-left whitespace-normal md:h-auto"
            aria-label={actionLabel}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={invalidAria(error)}
            disabled={disabled}
            onClick={onOpen}
          />
        }
      >
        <DocumentReviewSummary document={document} locale={locale} />
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <ChevronRightIcon aria-hidden="true" />
        </span>
      </BottomSheetTrigger>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="px-4 pb-4 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </article>
  );
}

function firstDocumentError(
  documentKey: string,
  fieldErrors: FormErrors,
): string | undefined {
  for (const field of PERSON_DOCUMENT_FORM_FIELD_KEYS) {
    const error = fieldErrors[documentFieldErrorKey(documentKey, field)];
    if (error) return error;
  }

  return undefined;
}
