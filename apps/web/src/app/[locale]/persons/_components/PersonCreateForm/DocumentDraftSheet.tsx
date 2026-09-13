"use client";

import { v1 } from "@repo/api-shared";
import {
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  Button,
} from "@repo/ui/components";
import { buildDateOnly } from "@repo/ui/lib/date-parts";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DocumentDraftFields } from "./DocumentDraftFields";
import type {
  CreatePersonDocumentFormState,
  FormErrors,
  SetPersonDocumentValue,
} from "./types";

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
        <DocumentDraftFields
          document={document}
          documentId={documentId}
          fieldErrors={fieldErrors}
          locale={locale}
          disabled={disabled}
          onSetDocumentValue={onSetDocumentValue}
          expiryError={localExpiresOnError}
          onClearExpiryError={() => setLocalExpiresOnError(null)}
        />
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
