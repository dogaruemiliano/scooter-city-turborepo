"use client";

import {
  Button,
  FormSection,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@repo/ui/components";
import { InfoIcon } from "lucide-react";
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
    <FormSection aria-label={t("sections.documentPhotos")}>
      {form.documents.map((document, index) => (
        <fieldset
          key={document.key}
          className="grid min-w-0 gap-3 sm:col-span-2"
          aria-labelledby={`${formId}-${document.key}-photos-label`}
          aria-describedby={
            fieldErrors[documentFieldErrorKey(document.key, "photos")]
              ? `${formId}-${document.key}-photos-error`
              : undefined
          }
        >
          <legend className="mb-3 flex w-full items-center justify-between gap-2 text-sm font-medium">
            <span id={`${formId}-${document.key}-photos-label`}>
              {t(`documentTypes.${document.type}`)}{" "}
              {!document.required ? (
                <span className="ml-2 font-normal text-muted-foreground">
                  {t("documentForm.optional")}
                </span>
              ) : null}
            </span>
            {index === 0 ? (
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="text"
                      size="icon-sm"
                      className="justify-end p-0"
                      aria-label={t("documentForm.uploadRequirementsLabel")}
                    />
                  }
                >
                  <InfoIcon
                    aria-hidden="true"
                    className="group-aria-expanded/button:text-link"
                  />
                </PopoverTrigger>
                <PopoverContent align="end">
                  <PopoverTitle className="sr-only">
                    {t("documentForm.uploadRequirementsLabel")}
                  </PopoverTitle>
                  <PopoverDescription>
                    {t("documentForm.uploadRequirements")}
                  </PopoverDescription>
                </PopoverContent>
              </Popover>
            ) : null}
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                acceptsPdf
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
