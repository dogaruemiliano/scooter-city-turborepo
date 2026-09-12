"use client";

import { v1 } from "@repo/api-shared";
import {
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  Button,
  CountrySheetSelect,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@repo/ui/components";
import { buildDateOnly } from "@repo/ui/lib/date-parts";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DocumentExpiryField } from "../DocumentExpiryField";
import { LicenseCategoriesFields } from "../LicenseCategoriesFields";
import { documentFieldErrorKey, fieldErrorId, invalidAria } from "./errors";
import { FormField } from "./FormField";
import { FieldExtractionHint } from "./FieldExtractionHint";
import type {
  CreatePersonDocumentFormState,
  FormErrors,
  SetPersonDocumentValue,
} from "./types";
import { DatePartsInput } from "@/components/DateField";

export function DocumentDraftSheet({
  title,
  document,
  documentId,
  fieldErrors,
  locale,
  disabled,
  onSave,
  onSetDocumentValue,
}: {
  title: string;
  document: CreatePersonDocumentFormState;
  documentId: string;
  fieldErrors: FormErrors;
  locale: string;
  showUnder18Warning: boolean;
  disabled: boolean;
  onSave: () => void;
  onSetDocumentValue: SetPersonDocumentValue;
}) {
  const t = useTranslations("persons");
  const [localExpiresOnError, setLocalExpiresOnError] = useState<string | null>(
    null,
  );
  const isNationalId = document.type === "nationalId";
  const seriesError =
    fieldErrors[documentFieldErrorKey(document.key, "series")];
  const numberError =
    fieldErrors[documentFieldErrorKey(document.key, "number")];
  const issuingCountryCodeError =
    fieldErrors[documentFieldErrorKey(document.key, "issuingCountryCode")];
  const issuedByError =
    fieldErrors[documentFieldErrorKey(document.key, "issuedBy")];
  const issuedOnError =
    fieldErrors[documentFieldErrorKey(document.key, "issuedOn")];
  const expiresOnError =
    localExpiresOnError ??
    fieldErrors[documentFieldErrorKey(document.key, "expiresOn")];
  const statusError =
    fieldErrors[documentFieldErrorKey(document.key, "status")];
  const notesError = fieldErrors[documentFieldErrorKey(document.key, "notes")];
  const photoUploadPending = hasPhotoWithStatus(document, "uploading");
  const photoUploadFailed = hasPhotoWithStatus(document, "failed");

  function saveDocument() {
    if (document.hasExpiryDate) {
      const expiresOn = buildDateOnly(document.expiresOn);
      if (expiresOn.error) {
        setLocalExpiresOnError(
          t(`feedback.date.${expiresOn.error}`, {
            field: t("fields.documentExpiresOn"),
          }),
        );
        return;
      }
    }

    setLocalExpiresOnError(null);
    onSave();
  }

  return (
    <>
      <BottomSheetHeader>
        <BottomSheetTitle>{title}</BottomSheetTitle>
      </BottomSheetHeader>
      <BottomSheetBody>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {isNationalId || document.series ? (
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
                label={t(
                  isNationalId
                    ? "fields.nationalIdNumber"
                    : "fields.documentNumber",
                )}
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
              label={t("fields.documentNumber")}
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
                  onSetDocumentValue(document.key, "number", event.target.value)
                }
              />
            </FormField>
          )}

          <FormField
            id={`${documentId}-issued-by`}
            extractionKey={`document.${document.key}.issuedBy`}
            label={t("fields.documentIssuedBy")}
            error={issuedByError}
          >
            <Input
              id={`${documentId}-issued-by`}
              aria-describedby={fieldErrorId(
                `${documentId}-issued-by`,
                issuedByError,
              )}
              aria-invalid={invalidAria(issuedByError)}
              name="documentIssuedBy"
              value={document.issuedBy}
              onChange={(event) =>
                onSetDocumentValue(document.key, "issuedBy", event.target.value)
              }
            />
          </FormField>
          <FormField
            id={`${documentId}-issued-on-day`}
            extractionKey={`document.${document.key}.issuedOn`}
            label={t("fields.documentIssuedOn")}
            error={issuedOnError}
          >
            <DatePartsInput
              baseId={`${documentId}-issued-on`}
              aria-describedby={fieldErrorId(
                `${documentId}-issued-on-day`,
                issuedOnError,
              )}
              invalid={Boolean(issuedOnError)}
              label={t("fields.documentIssuedOn")}
              locale={locale}
              value={document.issuedOn}
              onChange={(value) =>
                onSetDocumentValue(document.key, "issuedOn", value)
              }
            />
          </FormField>
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
                onSetDocumentValue(document.key, "issuingCountryCode", value)
              }
              searchPlaceholder={t("countryPicker.search")}
              clearSearchLabel={t("countryPicker.clearSearch")}
              emptyMessage={t("countryPicker.empty")}
              closeLabel={t("actions.close")}
            />
          </FormField>

          <DocumentExpiryField
            switchId={`${documentId}-has-expiry-date`}
            switchLabel={t("fields.documentHasExpiryDate")}
            checked={document.hasExpiryDate}
            switchDisabled={disabled}
            onCheckedChange={(checked) => {
              onSetDocumentValue(document.key, "hasExpiryDate", checked);
              if (!checked) setLocalExpiresOnError(null);
            }}
          >
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
                  setLocalExpiresOnError(null);
                  onSetDocumentValue(document.key, "expiresOn", value);
                }}
              />
            </FormField>
          </DocumentExpiryField>
          {document.type === "driverLicense" ? (
            <div className="grid gap-3 sm:col-span-2">
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
          <FormField
            id={`${documentId}-status`}
            label={t("fields.documentStatus")}
            error={statusError}
          >
            <Select
              value={document.status}
              onValueChange={(value) => {
                if (value) {
                  onSetDocumentValue(
                    document.key,
                    "status",
                    value as v1.persons.PersonDocumentStatus,
                  );
                }
              }}
            >
              <SelectTrigger
                id={`${documentId}-status`}
                aria-describedby={fieldErrorId(
                  `${documentId}-status`,
                  statusError,
                )}
                aria-invalid={invalidAria(statusError)}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {v1.persons.PERSON_DOCUMENT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(`documentStatuses.${status}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField
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
        </div>
      </BottomSheetBody>
      <BottomSheetFooter className="sm:flex-row-reverse sm:justify-start">
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={disabled || photoUploadPending || photoUploadFailed}
          onClick={saveDocument}
        >
          {photoUploadPending
            ? t("actions.uploadingDocumentPhoto")
            : t("actions.save")}
        </Button>
        <BottomSheetClose
          render={
            <Button
              type="button"
              variant="text"
              className="w-full sm:w-auto"
              disabled={disabled}
            />
          }
        >
          {t("actions.cancel")}
        </BottomSheetClose>
      </BottomSheetFooter>
    </>
  );
}

function hasPhotoWithStatus(
  document: CreatePersonDocumentFormState,
  status: "uploading" | "failed",
): boolean {
  return v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS.some(
    (slot) => document.photos[slot]?.status === status,
  );
}
