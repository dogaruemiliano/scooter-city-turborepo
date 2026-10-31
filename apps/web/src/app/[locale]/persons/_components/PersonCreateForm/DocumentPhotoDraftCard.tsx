"use client";
import { useMediaViewerLabels } from "@/components/useMediaViewerLabels";
import { v1 } from "@repo/api-shared";
import { DocumentInput } from "@repo/ui/components/document-input";
import { useTranslations } from "next-intl";
import { DOCUMENT_PHOTO_ACCEPT } from "./constants";
import { DocumentExtractionFeedback } from "./DocumentExtractionFeedback";
import type { DocumentExtractionJob } from "./useDocumentExtraction";
import type {
  PersonDocumentPhotoDraftUpload,
  SetPersonDocumentPhoto,
} from "./types";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
export function DocumentPhotoDraftCard({
  inputId,
  documentKey,
  slot,
  slotLabel,
  upload,
  disabled,
  onSetDocumentPhoto,
  acceptsPdf = true,
  extractionJob,
  onRetryExtraction,
}: {
  inputId: string;
  documentKey: string;
  slot: v1.persons.PersonDocumentPhotoSlot;
  slotLabel: string;
  upload: PersonDocumentPhotoDraftUpload | undefined;
  disabled: boolean;
  onSetDocumentPhoto: SetPersonDocumentPhoto;
  acceptsPdf?: boolean;
  extractionJob?: DocumentExtractionJob;
  onRetryExtraction?: () => void;
}) {
  const t = useTranslations("persons");
  const media = useMediaViewerLabels();
  const accept = acceptsPdf
    ? `${DOCUMENT_PHOTO_ACCEPT},application/pdf`
    : DOCUMENT_PHOTO_ACCEPT;
  return (
    <div data-slot="document-preview" className="relative min-w-0">
      <DocumentInput
        editOnSelect
        id={inputId}
        value={
          upload
            ? {
                file: upload.file,
                fileName: upload.file.name,
                contentType: upload.file.type,
              }
            : undefined
        }
        accept={accept}
        disabled={disabled}
        uploaded={upload?.status === "uploaded"}
        status={
          upload?.status === "uploading"
            ? t("actions.uploadingDocumentPhoto")
            : undefined
        }
        validate={(file) =>
          !accept.split(",").includes(file.type) ||
          !file.size ||
          file.size > MAX_FILE_BYTES
            ? t("documentForm.invalidFile")
            : null
        }
        onRemove={
          upload ? () => onSetDocumentPhoto(documentKey, slot, null) : undefined
        }
        uploadError={upload?.status === "failed" ? upload.message : undefined}
        onRetry={
          upload?.status === "failed"
            ? () =>
                onSetDocumentPhoto(
                  documentKey,
                  slot,
                  upload.file,
                  upload.originalFile,
                )
            : undefined
        }
        onConfirm={(file) => onSetDocumentPhoto(documentKey, slot, file)}
        labels={{
          crop: media.cropLabel,
          editorLabels: media.editorLabels,
          label: slotLabel,
          add: t("documentForm.addPhoto", { slot: slotLabel }),
          preview: t("documentForm.changePhoto", { slot: slotLabel }),
          title: t("documentForm.photoSheetTitle", { slot: slotLabel }),
          imageAlt: t("detail.documents.photoAlt", { slot: slotLabel }),
          close: t("actions.cancel"),
          change: t("documentForm.changePhoto", { slot: slotLabel }),
          save: t("documentForm.savePreview"),
          openFile: t("documentForm.openFile"),
          actions: t("documentForm.documentActions"),
          remove: t("documentForm.removePhoto", { slot: slotLabel }),
          retry: t("documentForm.retryUpload"),
          error: t("documentForm.pdfPreviewError"),
          previousPage: t("documentForm.previousPage"),
          nextPage: t("documentForm.nextPage"),
          zoomIn: t("documentForm.zoomIn"),
          zoomOut: t("documentForm.zoomOut"),
          resetZoom: t("documentForm.resetZoom"),
        }}
      />
      <DocumentExtractionFeedback
        id={`${inputId}-feedback`}
        job={upload?.status === "uploaded" ? extractionJob : undefined}
        error={null}
        disabled={disabled}
        onRetry={onRetryExtraction}
      />
    </div>
  );
}
