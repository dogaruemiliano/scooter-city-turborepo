"use client";

import { v1 } from "@repo/api-shared";
import { Button } from "@repo/ui/components";
import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";

import { DocumentImageUploader } from "../DocumentImageUploader";
import { DOCUMENT_PHOTO_ACCEPT } from "./constants";
import type {
  PersonDocumentPhotoDraftUpload,
  SetPersonDocumentPhoto,
} from "./types";

export function DocumentPhotoDraftCard({
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
