"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

import { v1 } from "@repo/api-shared";
import { Button } from "@repo/ui/components";
import { useMediaCollection } from "@repo/ui/components/media-collection";
import { DocumentViewer } from "@repo/ui/components/document-viewer";
import { FileTextIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DocumentImageUploader } from "../DocumentImageUploader";
import { documentPhotoAccept } from "./constants";

export function DocumentPhotoCard({
  inputId,
  allowPdf = false,
  slot,
  slotLabel,
  photo,
  imageUrl,
  deleteBusy,
  disabled,
  onUploadPhoto,
  onDeletePhoto,
}: {
  inputId: string;
  allowPdf?: boolean;
  slot: v1.persons.PersonDocumentPhotoSlot;
  slotLabel: string;
  photo: v1.persons.PersonDocumentPhoto | undefined;
  imageUrl: string | null;
  deleteBusy: boolean;
  disabled: boolean;
  onUploadPhoto: (
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File,
  ) => Promise<boolean>;
  onDeletePhoto: (slot: v1.persons.PersonDocumentPhotoSlot) => Promise<boolean>;
}) {
  const session = useOptionalSession();
  const collection = useMediaCollection();
  const t = useTranslations("persons");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [failedUpload, setFailedUpload] = useState<File | null>(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const uploadLabel = t("detail.documents.photoUploadLabel", {
    slot: slotLabel,
  });
  const photoAlt = t("detail.documents.photoAlt", { slot: slotLabel });

  async function uploadPhoto(file: File) {
    setFailedUpload(null);
    const uploaded = await onUploadPhoto(slot, file);

    if (!uploaded) {
      setFailedUpload(file);
    }
  }

  async function deletePhoto() {
    if (await onDeletePhoto(slot)) {
      setDeleteConfirmationOpen(false);
    }
  }

  return (
    <div className="relative min-w-0">
      <DocumentImageUploader
        inputId={inputId}
        accept={
          allowPdf
            ? `${documentPhotoAccept},application/pdf`
            : documentPhotoAccept
        }
        uploadLabel={uploadLabel}
        slotLabel={slotLabel}
        imageUrl={imageUrl}
        onPreview={
          photo && imageUrl
            ? () => {
                if (!collection?.open(photo.id)) setPreviewOpen(true);
              }
            : undefined
        }
        previewLabel={`${t("actions.view")} ${photoAlt}`}
        preview={
          photo?.contentType === "application/pdf" ? (
            <span className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <FileTextIcon aria-hidden="true" className="size-7" />
              <span className="text-sm">PDF</span>
            </span>
          ) : undefined
        }
        alt={photoAlt}
        disabled={
          disabled ||
          deleteConfirmationOpen ||
          !canAccess(session?.user, "person_documents.write")
        }
        missingLabel={t("detail.documents.missingPhoto")}
        addLabel={t("detail.documents.addPhoto")}
        formatsLabel={t("detail.documents.photoFileTypesShort")}
        onFileSelected={(file) => {
          if (!file) return;
          void uploadPhoto(file);
        }}
        errorMessage={
          failedUpload
            ? t("documentForm.failedPhoto", { fileName: failedUpload.name })
            : null
        }
        retryLabel={t("documentForm.retryUpload")}
        onRetry={() => {
          if (failedUpload) {
            void uploadPhoto(failedUpload);
          }
        }}
        action={
          photo &&
          !deleteConfirmationOpen &&
          canAccess(session?.user, "person_documents.delete") ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("actions.deleteDocumentPhoto")}
              className="bg-background/95 shadow-sm"
              disabled={disabled}
              onClick={() => setDeleteConfirmationOpen(true)}
            >
              <Trash2Icon aria-hidden="true" />
            </Button>
          ) : null
        }
      />

      <DocumentViewer
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        src={imageUrl}
        contentType={photo?.contentType}
        fileName={photoAlt}
        title={photoAlt}
        imageAlt={photoAlt}
        closeLabel={t("actions.cancel")}
        openFileLabel={t("documentForm.openFile")}
        actionsLabel={t("documentForm.documentActions")}
        pdfLabels={{
          error: t("documentForm.pdfPreviewError"),
          previousPage: t("documentForm.previousPage"),
          nextPage: t("documentForm.nextPage"),
        }}
        zoomLabels={{
          zoomIn: t("documentForm.zoomIn"),
          zoomOut: t("documentForm.zoomOut"),
          resetZoom: t("documentForm.resetZoom"),
        }}
      />
      {photo?.contentType === "application/pdf" && imageUrl ? (
        <a
          href={imageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm text-primary underline"
        >
          {t("actions.view")} PDF
        </a>
      ) : null}
      {photo && deleteConfirmationOpen ? (
        <div
          role="alertdialog"
          aria-label={t("detail.documents.deleteConfirmation")}
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-scrim p-3 text-center"
        >
          <span className="text-sm font-semibold text-mist-50">
            {t("detail.documents.deleteConfirmation")}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={deleteBusy}
              onClick={() => setDeleteConfirmationOpen(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleteBusy}
              onClick={() => void deletePhoto()}
            >
              <Trash2Icon aria-hidden="true" data-icon="inline-start" />
              {deleteBusy
                ? t("actions.deleting")
                : t("actions.deletePermanently")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
