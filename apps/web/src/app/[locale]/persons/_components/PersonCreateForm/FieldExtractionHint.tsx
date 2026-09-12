"use client";

import { v1 } from "@repo/api-shared";
import { Button } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useExtractionReview } from "./ExtractionReviewContext";
import {
  readExtractionFieldValue,
  type ExtractionFieldKey,
  type ExtractionValue,
} from "./extraction-state";

export function FieldExtractionHint({
  fieldKey,
}: {
  fieldKey: ExtractionFieldKey;
}) {
  const context = useExtractionReview();
  const t = useTranslations("persons");
  const review = context?.state.fields[fieldKey];
  if (!context || !review) return null;
  const current = readExtractionFieldValue(context.state.form, fieldKey);
  const matching = review.suggestions.find(
    (suggestion) =>
      JSON.stringify(suggestion.value) === JSON.stringify(current),
  );
  const sources =
    matching?.sources ?? (review.outdated ? review.provenance : undefined);
  const sourceLabels = [
    ...new Set(
      sources?.map(
        (source) =>
          `${t(`documentTypes.${source.documentType}`)} · ${t(`documentPhotoSlots.${source.sourceSlot}`)}`,
      ) ?? [],
    ),
  ];
  const alternatives = review.suggestions.filter(
    (suggestion) => suggestion !== matching,
  );

  return (
    <div className="grid gap-2 text-sm">
      {sourceLabels.length ? (
        <p className="text-muted-foreground">
          {t("extraction.from", { source: sourceLabels.join(", ") })}
          {sources?.some((source) => source.needsReview)
            ? ` · ${t("extraction.checkValue")}`
            : ""}
        </p>
      ) : null}
      {review.outdated ? (
        <p className="text-warning-foreground">
          {t("extraction.sourceChanged")}
        </p>
      ) : null}
      {review.suggestions.length > 1 ? (
        <p className="text-warning-foreground">
          {t("extraction.conflictingValues")}
        </p>
      ) : null}
      {alternatives.map((suggestion) => {
        const source = [
          ...new Set(
            suggestion.sources.map((item) =>
              t(`documentTypes.${item.documentType}`),
            ),
          ),
        ].join(", ");
        const value = displayValue(suggestion.value);
        return (
          <div
            key={suggestion.id}
            className="grid gap-1 border-l-2 border-border pl-3"
          >
            <span className="break-words text-foreground">{value}</span>
            <span className="text-xs text-muted-foreground">
              {t("extraction.from", { source })}
              {suggestion.needsReview ? ` · ${t("extraction.checkValue")}` : ""}
            </span>
            <Button
              type="button"
              variant="text"
              className="h-auto justify-self-start px-0 py-1"
              aria-label={t("extraction.applyLabel", { value, source })}
              disabled={
                fieldKey === "person.city" &&
                context.state.form.countryCode === "RO" &&
                !v1.persons.matchRomanianLocality(
                  context.state.form.region,
                  value,
                )
              }
              onClick={() => context.onApplySuggestion(fieldKey, suggestion.id)}
            >
              {t("extraction.apply")}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function displayValue(value: ExtractionValue): string {
  return typeof value === "string"
    ? value
    : value
        .map((entry) =>
          [entry.category, entry.issuedOn, entry.expiresOn, entry.restrictions]
            .filter(Boolean)
            .join(" · "),
        )
        .join("; ");
}
