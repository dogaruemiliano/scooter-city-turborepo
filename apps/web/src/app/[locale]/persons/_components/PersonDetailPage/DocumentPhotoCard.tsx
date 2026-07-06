"use client";

import { v1 } from "@repo/api-shared";
import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { DocumentImageUploader } from "../DocumentImageUploader";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { documentPhotoAccept } from "./constants";

export function DocumentPhotoCard({
  inputId,
  slot,
  slotLabel,
  photo,
  imageUrl,
  uploadBusy,
  deleteBusy,
  disabled,
  onUploadPhoto,
  onDeletePhoto,
}: {
  inputId: string;
  slot: v1.persons.PersonDocumentPhotoSlot;
  slotLabel: string;
  photo: v1.persons.PersonDocumentPhoto | undefined;
  imageUrl: string | null;
  uploadBusy: boolean;
  deleteBusy: boolean;
  disabled: boolean;
  onUploadPhoto: (
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File,
  ) => Promise<boolean>;
  onDeletePhoto: (slot: v1.persons.PersonDocumentPhotoSlot) => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const uploadLabel = t("detail.documents.photoUploadLabel", {
    slot: slotLabel,
  });
  const photoAlt = t("detail.documents.photoAlt", { slot: slotLabel });

  return (
    <DocumentImageUploader
      inputId={inputId}
      accept={documentPhotoAccept}
      uploadLabel={uploadLabel}
      slotLabel={slotLabel}
      imageUrl={imageUrl}
      alt={photoAlt}
      disabled={disabled}
      missingLabel={t("detail.documents.missingPhoto")}
      addLabel={t("detail.documents.addPhoto")}
      replaceLabel={
        uploadBusy
          ? t("actions.uploadingDocumentPhoto")
          : t("detail.documents.replacePhoto")
      }
      formatsLabel={t("detail.documents.photoFileTypesShort")}
      onFileSelected={(file) => {
        if (!file) return;
        void onUploadPhoto(slot, file);
      }}
      action={
        photo ? (
          <ConfirmationDialog
            triggerLabel={t("actions.deleteDocumentPhoto")}
            triggerIcon={<Trash2Icon aria-hidden="true" />}
            triggerAriaLabel={t("actions.deleteDocumentPhoto")}
            triggerButtonClassName="bg-background/95 shadow-sm"
            triggerLabelClassName="sr-only"
            triggerSize="icon-sm"
            title={t("detail.dialogs.deleteDocumentPhotoTitle")}
            description={t("detail.dialogs.deleteDocumentPhotoDescription")}
            confirmLabel={t("actions.deleteDocumentPhoto")}
            busy={deleteBusy}
            onConfirm={() => onDeletePhoto(slot)}
          />
        ) : null
      }
    />
  );
}
