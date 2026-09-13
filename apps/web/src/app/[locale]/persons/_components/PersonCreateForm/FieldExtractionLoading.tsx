"use client";

import { Spinner } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useExtractionReview } from "./ExtractionReviewContext";
import type { ExtractionFieldKey } from "./extraction-state";
import { fieldHasPendingExtraction } from "./field-extraction-pending";

export function FieldExtractionLoading({
  fieldKey,
  label,
}: {
  fieldKey: ExtractionFieldKey;
  label: string;
}) {
  const context = useExtractionReview();
  const t = useTranslations("persons");
  if (!context) return null;
  const pending = fieldHasPendingExtraction(
    context.state,
    context.pendingDocumentKeys,
    fieldKey,
  );

  return pending ? (
    <Spinner
      label={t("extraction.fieldPending", { field: label })}
      className="shrink-0 text-muted-foreground"
    />
  ) : null;
}
