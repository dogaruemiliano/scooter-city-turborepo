"use client";

import { v1 } from "@repo/api-shared";
import { Spinner } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useExtractionReview } from "./ExtractionReviewContext";
import type { ExtractionFieldKey } from "./extraction-state";

const ADDRESS_FIELDS = new Set([
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "countryCode",
]);
const PERSON_FIELDS = new Set<string>(
  v1.persons.PERSON_EXTRACTION_PERSON_FIELDS,
);
const DOCUMENT_FIELDS = new Set<string>(
  v1.persons.PERSON_EXTRACTION_DOCUMENT_FIELDS,
);

export function FieldExtractionLoading({
  fieldKey,
  label,
}: {
  fieldKey: ExtractionFieldKey;
  label: string;
}) {
  const context = useExtractionReview();
  const t = useTranslations("persons");
  if (
    !context ||
    context.state.touched[fieldKey] ||
    context.state.autofilled[fieldKey]
  )
    return null;

  const pending = context.state.form.documents.some((document) => {
    if (!context.pendingDocumentKeys.has(document.key)) return false;
    if (fieldKey.startsWith("person.")) {
      const field = fieldKey.slice("person.".length);
      return (
        PERSON_FIELDS.has(field) &&
        !(
          ADDRESS_FIELDS.has(field) &&
          document.type === "nationalId" &&
          document.nationalIdFormat === "electronic"
        )
      );
    }
    const prefix = `document.${document.key}.`;
    if (!fieldKey.startsWith(prefix)) return false;
    const field = fieldKey.slice(prefix.length);
    if (field === "licenseCategories") return document.type === "driverLicense";
    if (field === "expiresOn" && !document.hasExpiryDate) return false;
    return DOCUMENT_FIELDS.has(field);
  });

  return pending ? (
    <Spinner
      label={t("extraction.fieldPending", { field: label })}
      className="shrink-0 text-muted-foreground"
    />
  ) : null;
}
