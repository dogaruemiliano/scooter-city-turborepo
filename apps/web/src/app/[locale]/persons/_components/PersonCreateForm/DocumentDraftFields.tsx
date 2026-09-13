"use client";

import { CountrySheetSelect, Input, Textarea } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DatePartsInput } from "@/components/DateField";
import { DocumentExpiryField } from "../DocumentExpiryField";
import { LicenseCategoriesFields } from "../LicenseCategoriesFields";
import {
  documentHasSeries,
  documentNumberLabel,
} from "./DocumentReviewSummary";
import { documentFieldErrorKey, fieldErrorId, invalidAria } from "./errors";
import { FormField } from "./FormField";
import { FieldExtractionHint } from "./FieldExtractionHint";
import { useExtractionReview } from "./ExtractionReviewContext";
import { extractionFieldNeedsReview } from "./extraction-state";
import type {
  CreatePersonDocumentFormState,
  FormErrors,
  SetPersonDocumentValue,
  PersonDocumentFormFieldKey,
} from "./types";

export function DocumentDraftFields({
  document,
  documentId,
  fieldErrors,
  locale,
  disabled,
  onSetDocumentValue,
  expiryError,
  onClearExpiryError,
  reviewOnly = false,
}: {
  document: CreatePersonDocumentFormState;
  documentId: string;
  fieldErrors: FormErrors;
  locale: string;
  disabled: boolean;
  onSetDocumentValue: SetPersonDocumentValue;
  expiryError?: string | null;
  onClearExpiryError?: () => void;
  reviewOnly?: boolean;
}) {
  const t = useTranslations("persons");
  const extraction = useExtractionReview();
  const [visibleReviewFields, setVisibleReviewFields] = useState<string[]>([]);
  const unresolvedFields = [
    "series",
    "number",
    "issuingCountryCode",
    "expiresOn",
    "licenseCategories",
  ].filter(
    (field) =>
      extraction &&
      extractionFieldNeedsReview(
        extraction.state,
        `document.${document.key}.${field}` as Parameters<
          typeof extractionFieldNeedsReview
        >[1],
      ),
  );
  const addedFields = unresolvedFields.filter(
    (field) => !visibleReviewFields.includes(field),
  );
  if (reviewOnly && addedFields.length)
    setVisibleReviewFields([...visibleReviewFields, ...addedFields]);
  const showField = (field: PersonDocumentFormFieldKey) =>
    !reviewOnly ||
    visibleReviewFields.includes(field) ||
    Boolean(
      extraction &&
      extractionFieldNeedsReview(
        extraction.state,
        `document.${document.key}.${field}`,
      ),
    );
  if (
    reviewOnly &&
    (document.type === "proofOfAddress" ||
      ![
        "series",
        "number",
        "issuingCountryCode",
        "expiresOn",
        "licenseCategories",
      ].some((field) => showField(field as PersonDocumentFormFieldKey)))
  )
    return null;
  const seriesError =
    fieldErrors[documentFieldErrorKey(document.key, "series")];
  const numberError =
    fieldErrors[documentFieldErrorKey(document.key, "number")];
  const issuingCountryCodeError =
    fieldErrors[documentFieldErrorKey(document.key, "issuingCountryCode")];
  const expiresOnError =
    expiryError ??
    fieldErrors[documentFieldErrorKey(document.key, "expiresOn")];
  const notesError = fieldErrors[documentFieldErrorKey(document.key, "notes")];
  const categoriesNeedReview = Boolean(
    !disabled &&
    extraction &&
    extractionFieldNeedsReview(
      extraction.state,
      `document.${document.key}.licenseCategories`,
    ),
  );

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      {document.type !== "proofOfAddress" ? (
        <>
          {showField("series") || showField("number") ? (
            <>
              {documentHasSeries(document) ? (
                <div className="grid min-w-0 grid-cols-3 gap-3 sm:col-span-2">
                  <FormField
                    id={`${documentId}-series`}
                    extractionKey={`document.${document.key}.series`}
                    label={t("fields.documentSeries")}
                    className="col-span-1"
                    error={seriesError}
                  >
                    <Input
                      id={`${documentId}-series`}
                      aria-describedby={fieldErrorId(
                        `${documentId}-series`,
                        seriesError,
                      )}
                      aria-invalid={invalidAria(seriesError)}
                      name="documentSeries"
                      maxLength={10}
                      value={document.series}
                      onChange={(event) =>
                        onSetDocumentValue(
                          document.key,
                          "series",
                          event.target.value.toUpperCase(),
                        )
                      }
                    />
                  </FormField>
                  <FormField
                    id={`${documentId}-number`}
                    extractionKey={`document.${document.key}.number`}
                    label={t(`fields.${documentNumberLabel(document)}`)}
                    className="col-span-2"
                    error={numberError}
                  >
                    <Input
                      id={`${documentId}-number`}
                      aria-describedby={fieldErrorId(
                        `${documentId}-number`,
                        numberError,
                      )}
                      aria-invalid={invalidAria(numberError)}
                      name="documentNumber"
                      value={document.number}
                      onChange={(event) =>
                        onSetDocumentValue(
                          document.key,
                          "number",
                          event.target.value,
                        )
                      }
                    />
                  </FormField>
                </div>
              ) : (
                <FormField
                  id={`${documentId}-number`}
                  extractionKey={`document.${document.key}.number`}
                  label={t(`fields.${documentNumberLabel(document)}`)}
                  error={numberError}
                >
                  <Input
                    id={`${documentId}-number`}
                    aria-describedby={fieldErrorId(
                      `${documentId}-number`,
                      numberError,
                    )}
                    aria-invalid={invalidAria(numberError)}
                    name="documentNumber"
                    value={document.number}
                    onChange={(event) =>
                      onSetDocumentValue(
                        document.key,
                        "number",
                        event.target.value,
                      )
                    }
                  />
                </FormField>
              )}
            </>
          ) : null}
          {showField("issuingCountryCode") ? (
            <div className="grid min-w-0 gap-4 sm:col-span-2 sm:grid-cols-2">
              <FormField
                id={`${documentId}-country`}
                extractionKey={`document.${document.key}.issuingCountryCode`}
                label={t("fields.documentIssuingCountryCode")}
                error={issuingCountryCodeError}
              >
                <CountrySheetSelect
                  id={`${documentId}-country`}
                  label={t("fields.documentIssuingCountryCode")}
                  labelledById={`${documentId}-country-label`}
                  describedById={fieldErrorId(
                    `${documentId}-country`,
                    issuingCountryCodeError,
                  )}
                  invalid={Boolean(issuingCountryCodeError)}
                  locale={locale}
                  value={document.issuingCountryCode}
                  placeholder={t("placeholders.country")}
                  onValueChange={(value) =>
                    onSetDocumentValue(
                      document.key,
                      "issuingCountryCode",
                      value,
                    )
                  }
                  searchPlaceholder={t("countryPicker.search")}
                  clearSearchLabel={t("countryPicker.clearSearch")}
                  emptyMessage={t("countryPicker.empty")}
                  closeLabel={t("actions.close")}
                />
              </FormField>
            </div>
          ) : null}
          {showField("expiresOn") ? (
            <DocumentExpiryField
              className="sm:col-span-2"
              switchClassName="justify-end *:data-[slot=field-label]:flex-initial *:data-[slot=field-label]:text-right"
              switchId={`${documentId}-has-expiry-date`}
              switchLabel={t("fields.documentHasExpiryDate")}
              checked={document.hasExpiryDate}
              switchDisabled={disabled}
              onCheckedChange={(checked) => {
                onSetDocumentValue(document.key, "hasExpiryDate", checked);
                if (!checked) onClearExpiryError?.();
              }}
            >
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <FormField
                  id={`${documentId}-expires-on-day`}
                  extractionKey={`document.${document.key}.expiresOn`}
                  label={t("fields.documentExpiresOn")}
                  disabled={disabled || !document.hasExpiryDate}
                  error={document.hasExpiryDate ? expiresOnError : undefined}
                >
                  <DatePartsInput
                    baseId={`${documentId}-expires-on`}
                    aria-describedby={fieldErrorId(
                      `${documentId}-expires-on-day`,
                      expiresOnError,
                    )}
                    disabled={disabled || !document.hasExpiryDate}
                    invalid={document.hasExpiryDate && Boolean(expiresOnError)}
                    label={t("fields.documentExpiresOn")}
                    locale={locale}
                    value={document.expiresOn}
                    onChange={(value) => {
                      onClearExpiryError?.();
                      onSetDocumentValue(document.key, "expiresOn", value);
                    }}
                  />
                </FormField>
              </div>
            </DocumentExpiryField>
          ) : null}
        </>
      ) : null}
      {document.type === "driverLicense" && showField("licenseCategories") ? (
        <div
          data-extraction-review={categoriesNeedReview || undefined}
          className={[
            "grid gap-3 sm:col-span-2",
            categoriesNeedReview
              ? "[&_input]:border-warning [&_input]:bg-warning-subtle [&_select]:border-warning [&_select]:bg-warning-subtle [&_fieldset>div]:border-warning [&_fieldset>button]:border-warning [&_fieldset>button]:bg-warning-subtle"
              : undefined,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <LicenseCategoriesFields
            value={document.licenseCategories}
            onChange={(value) =>
              onSetDocumentValue(document.key, "licenseCategories", value)
            }
            disabled={disabled}
          />
          <FieldExtractionHint
            fieldKey={`document.${document.key}.licenseCategories`}
          />
          {fieldErrors[
            documentFieldErrorKey(document.key, "licenseCategories")
          ] ? (
            <p role="alert" className="text-sm text-destructive">
              {
                fieldErrors[
                  documentFieldErrorKey(document.key, "licenseCategories")
                ]
              }
            </p>
          ) : null}
        </div>
      ) : null}
      {!reviewOnly ? (
        <FormField
          className="sm:col-span-2"
          id={`${documentId}-notes`}
          label={t("fields.notes")}
          error={notesError}
        >
          <Textarea
            id={`${documentId}-notes`}
            aria-describedby={fieldErrorId(`${documentId}-notes`, notesError)}
            aria-invalid={invalidAria(notesError)}
            name="documentNotes"
            maxLength={2000}
            value={document.notes}
            onChange={(event) =>
              onSetDocumentValue(document.key, "notes", event.target.value)
            }
          />
        </FormField>
      ) : null}
    </div>
  );
}
