"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useExtractionReview } from "./ExtractionReviewContext";
import {
  extractionFieldNeedsReview,
  type ExtractionFieldKey,
} from "./extraction-state";

export function FieldExtractionHint({
  fieldKey,
  id,
}: {
  fieldKey: ExtractionFieldKey;
  id?: string;
}) {
  const context = useExtractionReview();
  const t = useTranslations("persons");
  if (!context || !extractionFieldNeedsReview(context.state, fieldKey))
    return null;
  const review = context.state.fields[fieldKey]!;
  const message = review.outdated
    ? "sourceChanged"
    : review.missing
      ? "missingField"
      : review.suggestions.length > 1
        ? "conflictingValues"
        : "checkValue";
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-foreground">
      <TriangleAlertIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-warning"
      />
      {t(`extraction.${message}`)}
    </p>
  );
}
