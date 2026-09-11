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
import { buildDateOnly, dateDigits } from "@repo/ui/lib/date-parts";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DocumentExpiryField } from "../DocumentExpiryField";
import { LicenseCategoriesFields } from "../LicenseCategoriesFields";
import { documentFieldErrorKey, fieldErrorId, invalidAria } from "./errors";
import { FormField } from "./FormField";
import type {
  CreatePersonDocumentFormState,
  FormErrors,
  SetPersonDocumentValue,
} from "./types";
import { Under18Warning } from "./Under18Warning";
import { DatePartsInput } from "@/components/DateField";

export function DocumentDraftSheet({
  title,
  document,
  documentId,
  fieldErrors,
  locale,
  showUnder18Warning,
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
  const cnpError = fieldErrors[documentFieldErrorKey(document.key, "cnp")];
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
      if (!expiresOn.value) {
        setLocalExpiresOnError(
          expiresOn.error
            ? t(`feedback.date.${expiresOn.error}`, {
                field: t("fields.documentExpiresOn"),
              })
            : t("feedback.validation.required", {
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
          {isNationalId ? (
            <div className="grid min-w-0 grid-cols-3 gap-3 sm:col-span-2">
              <FormField
                id={`${documentId}-series`}
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
                label={t("fields.nationalIdNumber")}
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

          {isNationalId ? (
            <>
              <FormField
                id={`${documentId}-cnp`}
                label={t("fields.documentCnp")}
                required={document.required}
                error={cnpError}
              >
                <Input
                  id={`${documentId}-cnp`}
                  aria-describedby={fieldErrorId(`${documentId}-cnp`, cnpError)}
                  aria-invalid={invalidAria(cnpError)}
                  name="documentCnp"
                  inputMode="numeric"
                  maxLength={13}
                  value={document.cnp}
                  onChange={(event) =>
                    onSetDocumentValue(
                      document.key,
                      "cnp",
                      dateDigits(event.target.value, 13),
                    )
                  }
                />
              </FormField>
              {showUnder18Warning ? (
                <Under18Warning message={t("feedback.under18Warning")} />
              ) : null}
              <FormField
                id={`${documentId}-issued-by`}
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
                    onSetDocumentValue(
                      document.key,
                      "issuedBy",
                      event.target.value,
                    )
                  }
                />
              </FormField>
              <FormField
                id={`${documentId}-issued-on-day`}
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
            </>
          ) : (
            <FormField
              id={`${documentId}-country`}
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
                onValueChange={(value) =>
                  onSetDocumentValue(document.key, "issuingCountryCode", value)
                }
                searchPlaceholder={t("countryPicker.search")}
                clearSearchLabel={t("countryPicker.clearSearch")}
                emptyMessage={t("countryPicker.empty")}
                closeLabel={t("actions.close")}
              />
            </FormField>
          )}

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
              label={t("fields.documentExpiresOn")}
              required={document.hasExpiryDate}
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
                required={document.hasExpiryDate}
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
