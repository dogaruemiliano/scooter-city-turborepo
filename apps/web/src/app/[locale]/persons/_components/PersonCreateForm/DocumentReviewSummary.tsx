"use client";

import { buildDateOnly } from "@repo/ui/lib/date-parts";
import { useTranslations } from "next-intl";

import type { CreatePersonDocumentFormState } from "./types";

export function documentNumberLabel(document: CreatePersonDocumentFormState) {
  if (
    document.type === "nationalId" &&
    document.nationalIdFormat !== "electronic"
  )
    return "nationalIdNumber";
  if (document.type === "nationalId" || document.type === "passport")
    return "identityDocumentNumber";
  return "documentNumber";
}

export function documentHasSeries(document: CreatePersonDocumentFormState) {
  return document.type === "nationalId"
    ? document.nationalIdFormat !== "electronic"
    : document.type !== "passport" && Boolean(document.series);
}

export function DocumentReviewSummary({
  document,
  locale,
  compact = false,
}: {
  document: CreatePersonDocumentFormState;
  locale: string;
  compact?: boolean;
}) {
  const t = useTranslations("persons");
  const missing = t("documentForm.missingValue");
  function dateLabel(parts: CreatePersonDocumentFormState["issuedOn"]) {
    const parsed = buildDateOnly(parts);
    if (parsed.error) return t("documentForm.checkDate");
    if (!parsed.value) return missing;
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${parsed.value}T00:00:00Z`));
  }
  const expiry = document.hasExpiryDate
    ? buildDateOnly(document.expiresOn)
    : null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysRemaining = expiry?.value
    ? (Date.parse(`${expiry.value}T00:00:00Z`) - today) / 86_400_000
    : null;
  const expiryColor =
    daysRemaining === null
      ? undefined
      : daysRemaining < 7
        ? "text-destructive"
        : daysRemaining <= 30
          ? "text-warning"
          : undefined;
  const hasSeries = documentHasSeries(document);
  const values: { label: string; value: string; color?: string }[] = [
    ...(compact && hasSeries
      ? [
          {
            label: t("documentForm.seriesAndNumber"),
            value: `${document.series.trim() || missing} ${document.number.trim() || missing}`,
          },
        ]
      : [
          ...(hasSeries
            ? [
                {
                  label: t("fields.documentSeries"),
                  value: document.series.trim() || missing,
                },
              ]
            : []),
          {
            label: t(`fields.${documentNumberLabel(document)}`),
            value: document.number.trim() || missing,
          },
        ]),
    ...(!compact
      ? [
          {
            label: t("fields.documentIssuedOn"),
            value: dateLabel(document.issuedOn),
          },
        ]
      : []),
    {
      label: t("fields.documentExpiresOn"),
      value: document.hasExpiryDate
        ? dateLabel(document.expiresOn)
        : t("documentForm.noExpiryDate"),
      color: expiryColor,
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border p-4">
      {values.map(({ label, value, color }) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd
            className={`mt-1 break-words text-base ${value === missing ? "text-muted-foreground" : `font-medium ${color ?? "text-foreground"}`}`}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
