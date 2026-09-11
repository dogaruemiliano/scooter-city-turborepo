"use client";

import { FormSection } from "@repo/ui/components";
import { useTranslations } from "next-intl";

import { DocumentPhotoDraftCard } from "./DocumentPhotoDraftCard";
import type { CreatePersonFormState, SetPersonDocumentPhoto } from "./types";

export function DocumentPhotosSection({
  formId,
  form,
  disabled,
  onSetDocumentPhoto,
}: {
  formId: string;
  form: CreatePersonFormState;
  disabled: boolean;
  onSetDocumentPhoto: SetPersonDocumentPhoto;
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
        <fieldset key={document.key} className="grid min-w-0 gap-3">
          <legend className="mb-3 text-sm font-medium">
            {t(`documentTypes.${document.type}`)}{" "}
            {!document.required ? (
              <span className="ml-2 font-normal text-muted-foreground">
                {t("documentForm.optional")}
              </span>
            ) : null}
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {(["front", "back"] as const).map((slot) => (
              <DocumentPhotoDraftCard
                key={slot}
                inputId={`${formId}-document-${document.key}-${slot}-photo`}
                documentKey={document.key}
                slot={slot}
                slotLabel={t(`documentPhotoSlots.${slot}`)}
                upload={document.photos[slot]}
                disabled={disabled}
                onSetDocumentPhoto={onSetDocumentPhoto}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </FormSection>
  );
}
