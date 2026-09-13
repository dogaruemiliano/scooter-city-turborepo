"use client";

import { buildDateOnly } from "@repo/ui/lib/date-parts";
import { DocumentSummary } from "../DocumentSummary";

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
}: {
  document: CreatePersonDocumentFormState;
  locale: string;
}) {
  const expiry = buildDateOnly(document.expiresOn);
  return (
    <DocumentSummary
      type={document.type}
      number={[
        documentHasSeries(document) ? document.series.trim() : "",
        document.number.trim(),
      ]
        .filter(Boolean)
        .join(" ")}
      expiresOn={expiry.value ?? null}
      invalidExpiry={Boolean(expiry.error)}
      hasExpiryDate={document.hasExpiryDate}
      uploaded={document.photos.front?.status === "uploaded"}
      locale={locale}
    />
  );
}
