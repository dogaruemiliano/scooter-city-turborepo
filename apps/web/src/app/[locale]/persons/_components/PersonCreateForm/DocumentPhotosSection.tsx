"use client";

import { FormSection } from "@repo/ui/components";
import { useTranslations } from "next-intl";

import { DocumentPhotoDraftCard } from "./DocumentPhotoDraftCard";
import { documentPhotoSlots } from "./form-state";
import { documentFieldErrorKey } from "./errors";
import type {
  CreatePersonFormState,
  SetPersonDocumentPhoto,
  FormErrors,
} from "./types";

export function DocumentPhotosSection({
  formId,
  form,
  disabled,
  onSetDocumentPhoto,
  fieldErrors,
}: {
  formId: string;
  form: CreatePersonFormState;
  disabled: boolean;
  onSetDocumentPhoto: SetPersonDocumentPhoto;
  fieldErrors: FormErrors;
}) {
  const t = useTranslations("persons");

  return (
    <FormSection
      title={t("sections.documentPhotos")}
      aria-label={t("sections.documentPhotos")}
    >
      <p className="text-sm text-muted-foreground sm:col-span-2">
        {t("documentForm.photosFirstHelp")}
      </p>
      {form.documents.map((document) => (
        <fieldset
          key={document.key}
          className="grid min-w-0 gap-3"
          aria-describedby={
            fieldErrors[documentFieldErrorKey(document.key, "photos")]
              ? `${formId}-${document.key}-photos-error`
              : undefined
          }
        >
          <legend className="mb-3 text-sm font-medium">
            {t(`documentTypes.${document.type}`)}{" "}
            {!document.required ? (
              <span className="ml-2 font-normal text-muted-foreground">
                {t("documentForm.optional")}
              </span>
            ) : null}
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {documentPhotoSlots(document).map((slot) => (
              <DocumentPhotoDraftCard
                key={slot}
                inputId={`${formId}-document-${document.key}-${slot}-photo`}
                documentKey={document.key}
                slot={slot}
                slotLabel={
                  document.type === "proofOfAddress"
                    ? t("documentTypes.proofOfAddress")
                    : t(`documentPhotoSlots.${slot}`)
                }
                acceptsPdf={document.type === "proofOfAddress"}
                upload={document.photos[slot]}
                disabled={disabled}
                onSetDocumentPhoto={onSetDocumentPhoto}
              />
            ))}
          </div>
          {document.type === "proofOfAddress" ? (
            <p className="text-sm text-muted-foreground">
              {t("documentForm.proofOfAddressHelp")}
            </p>
          ) : null}
          {document.type === "driverLicense" ? (
            <p className="text-sm text-muted-foreground">
              {t("license.uploadHelp")}
            </p>
          ) : null}
          {fieldErrors[documentFieldErrorKey(document.key, "photos")] ? (
            <p
              id={`${formId}-${document.key}-photos-error`}
              role="alert"
              className="text-sm text-destructive"
            >
              {fieldErrors[documentFieldErrorKey(document.key, "photos")]}
            </p>
          ) : null}
        </fieldset>
      ))}
    </FormSection>
  );
}
