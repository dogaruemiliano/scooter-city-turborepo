"use client";

import { v1 } from "@repo/api-shared";
import {
  Button,
  CountrySelect,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@repo/ui/components";
import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";

import { DocumentImageUploader } from "../DocumentImageUploader";
import {
  DOCUMENT_PHOTO_ACCEPT,
  FOREIGN_IDENTITY_DOCUMENT_TYPES,
} from "./constants";
import { DatePartsInput } from "./DatePartsInput";
import { dateDigits } from "./date-utils";
import { documentFieldErrorKey, fieldErrorId, invalidAria } from "./errors";
import { FormField, FormSection } from "./FormLayout";
import { Under18Warning } from "./Under18Warning";
import type {
  CreatePersonFormState,
  FormErrors,
  PersonDocumentPhotoDraftUpload,
  SetPersonDocumentPhoto,
  SetPersonDocumentValue,
} from "./types";

export function DocumentsSection({
  formId,
  form,
  fieldErrors,
  locale,
  showUnder18Warning,
  disabled,
  onSetDocumentValue,
  onSetDocumentPhoto,
}: {
  formId: string;
  form: CreatePersonFormState;
  fieldErrors: FormErrors;
  locale: string;
  showUnder18Warning: boolean;
  disabled: boolean;
  onSetDocumentValue: SetPersonDocumentValue;
  onSetDocumentPhoto: SetPersonDocumentPhoto;
}) {
  const t = useTranslations("persons");

  return (
    <FormSection title={t("sections.document")}>
      {form.documents.map((document) => {
        const documentId = `${formId}-document-${document.key}`;
        const isNationalId = document.type === "nationalId";
        const canChangeIdentityType =
          form.citizenship === "foreign" && document.slot === "identity";
        const typeError =
          fieldErrors[documentFieldErrorKey(document.key, "type")];
        const seriesError =
          fieldErrors[documentFieldErrorKey(document.key, "series")];
        const numberError =
          fieldErrors[documentFieldErrorKey(document.key, "number")];
        const cnpError =
          fieldErrors[documentFieldErrorKey(document.key, "cnp")];
        const issuingCountryCodeError =
          fieldErrors[
            documentFieldErrorKey(document.key, "issuingCountryCode")
          ];
        const issuedByError =
          fieldErrors[documentFieldErrorKey(document.key, "issuedBy")];
        const issuedOnError =
          fieldErrors[documentFieldErrorKey(document.key, "issuedOn")];
        const expiresOnError =
          fieldErrors[documentFieldErrorKey(document.key, "expiresOn")];
        const statusError =
          fieldErrors[documentFieldErrorKey(document.key, "status")];
        const notesError =
          fieldErrors[documentFieldErrorKey(document.key, "notes")];

        return (
          <div
            key={document.key}
            className="grid min-w-0 gap-4 rounded-lg border border-border bg-background p-4 shadow-sm sm:col-span-2 sm:grid-cols-2"
          >
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <h3 className="text-sm font-bold">
                {document.slot === "driverLicense"
                  ? t("documentTypes.driverLicense")
                  : t(`documentTypes.${document.type}`)}
              </h3>
              <span className="text-xs font-medium text-muted-foreground">
                {document.required
                  ? t("documentForm.required")
                  : t("documentForm.optional")}
              </span>
            </div>

            {canChangeIdentityType ? (
              <FormField
                id={`${documentId}-type`}
                label={t("fields.documentType")}
                required={document.required}
                error={typeError}
              >
                <Select
                  value={document.type}
                  onValueChange={(value) => {
                    if (value) {
                      onSetDocumentValue(
                        document.key,
                        "type",
                        value as v1.persons.PersonDocumentType,
                      );
                    }
                  }}
                >
                  <SelectTrigger
                    id={`${documentId}-type`}
                    aria-describedby={fieldErrorId(
                      `${documentId}-type`,
                      typeError,
                    )}
                    aria-invalid={invalidAria(typeError)}
                    className="w-full"
                  >
                    <SelectValue placeholder={t("placeholders.documentType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {FOREIGN_IDENTITY_DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`documentTypes.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            ) : null}

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
                    onSetDocumentValue(
                      document.key,
                      "number",
                      event.target.value,
                    )
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
                    aria-describedby={fieldErrorId(
                      `${documentId}-cnp`,
                      cnpError,
                    )}
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
                <CountrySelect
                  id={`${documentId}-country`}
                  aria-describedby={fieldErrorId(
                    `${documentId}-country`,
                    issuingCountryCodeError,
                  )}
                  aria-invalid={invalidAria(issuingCountryCodeError)}
                  name="documentIssuingCountryCode"
                  locale={locale}
                  value={document.issuingCountryCode}
                  onValueChange={(value) =>
                    onSetDocumentValue(
                      document.key,
                      "issuingCountryCode",
                      value,
                    )
                  }
                />
              </FormField>
            )}

            <FormField
              id={`${documentId}-expires-on-day`}
              label={t("fields.documentExpiresOn")}
              error={expiresOnError}
            >
              <DatePartsInput
                baseId={`${documentId}-expires-on`}
                aria-describedby={fieldErrorId(
                  `${documentId}-expires-on-day`,
                  expiresOnError,
                )}
                invalid={Boolean(expiresOnError)}
                label={t("fields.documentExpiresOn")}
                locale={locale}
                value={document.expiresOn}
                onChange={(value) =>
                  onSetDocumentValue(document.key, "expiresOn", value)
                }
              />
            </FormField>
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
                aria-describedby={fieldErrorId(
                  `${documentId}-notes`,
                  notesError,
                )}
                aria-invalid={invalidAria(notesError)}
                name="documentNotes"
                maxLength={2000}
                value={document.notes}
                onChange={(event) =>
                  onSetDocumentValue(document.key, "notes", event.target.value)
                }
              />
            </FormField>

            <div className="grid gap-3 sm:col-span-2">
              <div className="grid gap-1">
                <h4 className="text-sm font-medium">
                  {t("detail.documents.photosTitle")}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t("documentForm.photoHelp")}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS.filter(
                  (slot) => slot !== "other" || document.photos[slot],
                ).map((slot) => {
                  const photoInputId = `${documentId}-${slot}-photo`;
                  const slotLabel = t(`documentPhotoSlots.${slot}`);
                  const upload = document.photos[slot];

                  return (
                    <DocumentPhotoDraftCard
                      key={slot}
                      inputId={photoInputId}
                      documentKey={document.key}
                      slot={slot}
                      slotLabel={slotLabel}
                      upload={upload}
                      disabled={disabled}
                      onSetDocumentPhoto={onSetDocumentPhoto}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
      {fieldErrors.documents ? (
        <p
          id={`${formId}-documents-error`}
          role="alert"
          className="text-sm text-destructive sm:col-span-2"
        >
          {fieldErrors.documents}
        </p>
      ) : null}
    </FormSection>
  );
}

function DocumentPhotoDraftCard({
  inputId,
  documentKey,
  slot,
  slotLabel,
  upload,
  disabled,
  onSetDocumentPhoto,
}: {
  inputId: string;
  documentKey: string;
  slot: v1.persons.PersonDocumentPhotoSlot;
  slotLabel: string;
  upload: PersonDocumentPhotoDraftUpload | undefined;
  disabled: boolean;
  onSetDocumentPhoto: SetPersonDocumentPhoto;
}) {
  const t = useTranslations("persons");
  const previewUrl = useObjectUrl(upload?.file ?? null);
  const uploadLabel = t("detail.documents.photoUploadLabel", {
    slot: slotLabel,
  });
  const photoAlt = t("detail.documents.photoAlt", { slot: slotLabel });

  return (
    <DocumentImageUploader
      inputId={inputId}
      accept={DOCUMENT_PHOTO_ACCEPT}
      uploadLabel={uploadLabel}
      slotLabel={slotLabel}
      imageUrl={previewUrl}
      alt={photoAlt}
      disabled={disabled}
      missingLabel={t("detail.documents.missingPhoto")}
      addLabel={t("detail.documents.addPhoto")}
      replaceLabel={t("detail.documents.replacePhoto")}
      formatsLabel={t("detail.documents.photoFileTypesShort")}
      onFileSelected={(selectedFile) =>
        onSetDocumentPhoto(documentKey, slot, selectedFile)
      }
      action={
        upload ? (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("actions.deleteDocumentPhoto")}
            disabled={disabled}
            onClick={() => onSetDocumentPhoto(documentKey, slot, null)}
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        ) : null
      }
    />
  );
}

function useObjectUrl(file: File | null): string | null {
  const objectUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  return objectUrl;
}
