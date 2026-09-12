"use client";

import { v1 } from "@repo/api-shared";
import { aspectRatio } from "@repo/theme";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@repo/ui/components";
import { ImageCapture } from "@repo/ui/components/image-capture";
import {
  CameraIcon,
  CheckIcon,
  CropIcon,
  FileTextIcon,
  ImagePlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type DragEvent } from "react";
import { DOCUMENT_PHOTO_ACCEPT } from "./constants";
import type {
  PersonDocumentPhotoDraftUpload,
  SetPersonDocumentPhoto,
} from "./types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const IDENTITY_CARD_DOCUMENT_KEYS = new Set([
  "romanian-classic-national-id",
  "romanian-electronic-national-id",
  "driver-license",
  "foreign-residence-permit",
]);

export function DocumentPhotoDraftCard({
  inputId,
  documentKey,
  slot,
  slotLabel,
  upload,
  disabled,
  onSetDocumentPhoto,
  acceptsPdf = true,
}: {
  inputId: string;
  documentKey: string;
  slot: v1.persons.PersonDocumentPhotoSlot;
  slotLabel: string;
  upload: PersonDocumentPhotoDraftUpload | undefined;
  disabled: boolean;
  onSetDocumentPhoto: SetPersonDocumentPhoto;
  acceptsPdf?: boolean;
}) {
  const t = useTranslations("persons");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [capture, setCapture] = useState<{ initialFile?: File } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const previewUrl = useObjectUrl(upload?.file ?? null);
  const isPdf = upload?.file.type === "application/pdf";
  const accept = acceptsPdf
    ? `${DOCUMENT_PHOTO_ACCEPT},application/pdf`
    : DOCUMENT_PHOTO_ACCEPT;
  const triggerLabel = t(
    upload ? "documentForm.changePhoto" : "documentForm.addPhoto",
    { slot: slotLabel },
  );
  const photoAlt = t("detail.documents.photoAlt", { slot: slotLabel });

  function dropFile(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file || disabled) return;
    if (
      !accept.split(",").includes(file.type) ||
      file.size === 0 ||
      file.size > MAX_FILE_BYTES
    ) {
      setError(t("documentForm.invalidFile"));
      return;
    }
    setError(null);
    setPreviewOpen(false);
    setCapture({ initialFile: file });
  }

  function beginCrop() {
    const source = upload?.originalFile ?? upload?.file;
    if (!source || source.type === "application/pdf") return;
    setPreviewOpen(false);
    setCapture({ initialFile: source });
  }

  return (
    <>
      <div
        className="relative min-w-0"
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={dropFile}
      >
        <Button
          id={inputId}
          type="button"
          variant="outline"
          aria-label={triggerLabel}
          disabled={disabled}
          style={{ aspectRatio: aspectRatio.documentLandscape }}
          className={`group relative h-auto w-full overflow-hidden rounded-lg p-0 whitespace-normal md:h-auto ${dragging ? "border-primary bg-accent" : ""}`}
          onClick={() => {
            setError(null);
            if (upload) setPreviewOpen(true);
            else setCapture({});
          }}
        >
          {upload?.file.type === "application/pdf" ? (
            <span className="flex h-full w-full flex-col items-center justify-center gap-2 p-4">
              <FileTextIcon
                className="size-7 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="max-w-full truncate text-sm">
                {upload.file.name}
              </span>
            </span>
          ) : previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local document preview.
            <img
              src={previewUrl}
              alt={photoAlt}
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : (
            <span className="flex flex-col items-center gap-2 px-3 text-center">
              <ImagePlusIcon
                className="size-8 text-muted-foreground group-hover:text-foreground"
                aria-hidden="true"
              />
              {dragging ? (
                <span className="text-sm font-medium">
                  {t("documentForm.dropFile")}
                </span>
              ) : null}
            </span>
          )}
          <span className="absolute top-2 left-2">
            <Badge variant={upload ? "secondary" : "outline"}>
              {upload?.status === "uploaded" ? (
                <CheckIcon aria-hidden="true" />
              ) : null}
              {slotLabel}
            </Badge>
          </span>
          {upload?.status === "uploading" ? (
            <span
              role="status"
              className="absolute inset-x-0 bottom-0 bg-popover p-2 text-xs text-popover-foreground"
            >
              {t("actions.uploadingDocumentPhoto")}
            </span>
          ) : null}
        </Button>
        {upload?.status === "failed" ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-media-scrim">
            <span role="alert" className="sr-only">
              {upload.message}
            </span>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="pointer-events-auto"
              aria-label={t("documentForm.retryUpload")}
              disabled={disabled}
              onClick={() =>
                onSetDocumentPhoto(
                  documentKey,
                  slot,
                  upload.file,
                  upload.originalFile,
                )
              }
            >
              <RotateCcwIcon aria-hidden="true" />
            </Button>
            <span className="text-sm text-scrim-foreground">
              {t("documentForm.retryUpload")}
            </span>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Dialog open={previewOpen && !capture} onOpenChange={setPreviewOpen}>
        <DialogContent
          showCloseButton={false}
          className="inset-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none"
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropFile}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border p-4">
            <DialogTitle>
              {t("documentForm.photoSheetTitle", { slot: slotLabel })}
            </DialogTitle>
            <Button
              type="button"
              variant="text"
              onClick={() => setPreviewOpen(false)}
            >
              {t("actions.cancel")}
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            {previewUrl && upload ? (
              isPdf ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                  <object
                    data={previewUrl}
                    type="application/pdf"
                    aria-label={upload.file.name}
                    className="min-h-0 w-full flex-1"
                  >
                    <FileTextIcon aria-hidden="true" />
                  </object>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-center text-primary underline"
                  >
                    {t("documentForm.openFile")} — {upload.file.name}
                  </a>
                </div>
              ) : (
                <div className="relative min-h-0 flex-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local document preview. */}
                  <img
                    src={previewUrl}
                    alt={photoAlt}
                    className="absolute inset-0 h-full w-full object-contain p-4"
                  />
                </div>
              )
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap justify-center gap-2 border-t border-border bg-popover p-4 pb-[max(var(--spacing-4),env(safe-area-inset-bottom))] text-popover-foreground">
            {error ? (
              <p
                role="alert"
                className="w-full text-center text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setPreviewOpen(false);
                setCapture({});
              }}
            >
              <CameraIcon aria-hidden="true" />
              {t("documentForm.changePhoto", { slot: slotLabel })}
            </Button>
            {upload && !isPdf ? (
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={beginCrop}
              >
                <CropIcon aria-hidden="true" />
                {t("documentForm.cropPhoto")}
              </Button>
            ) : null}
            {upload ? (
              <Button
                type="button"
                variant="text"
                className="text-destructive"
                disabled={disabled}
                onClick={() => {
                  onSetDocumentPhoto(documentKey, slot, null);
                  setError(null);
                  setPreviewOpen(false);
                }}
              >
                <Trash2Icon aria-hidden="true" />
                {t("documentForm.removePhoto", { slot: slotLabel })}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <ImageCapture
        open={capture !== null}
        onOpenChange={(open) => {
          if (!open) setCapture(null);
        }}
        initialFile={capture?.initialFile}
        captureMode={
          IDENTITY_CARD_DOCUMENT_KEYS.has(documentKey)
            ? "identity-card"
            : "photo"
        }
        allowGallery
        allowCrop
        accept={accept}
        maxFileSize={MAX_FILE_BYTES}
        onCapture={(file, { originalFile }) => {
          onSetDocumentPhoto(
            documentKey,
            slot,
            file,
            file === originalFile ? undefined : originalFile,
          );
        }}
        labels={{
          title: t("documentForm.photoSheetTitle", { slot: slotLabel }),
          close: t("documentForm.closeCamera"),
          capture: t("documentForm.capturePhoto"),
          choosePhoto: t("documentForm.choosePhoto"),
          gallery: t("documentForm.chooseFromGallery"),
          files: t("documentForm.chooseFromFiles"),
          switchCamera: t("documentForm.switchCamera"),
          startingCamera: t("documentForm.cameraStarting"),
          cameraUnavailable: t("documentForm.cameraUnavailableDescription"),
          retryCamera: t("documentForm.retryCamera"),
          cropTitle: t("documentForm.cropPhoto"),
          cropHint: t("documentForm.cropHelp"),
          previewTitle: t("documentForm.photoSheetTitle", { slot: slotLabel }),
          previewAlt: photoAlt,
          retake: t("documentForm.retakePhoto"),
          usePhoto: t("documentForm.usePhoto"),
          useFile: t("documentForm.useFile"),
          processing: t("documentForm.processingPhoto"),
          unsupportedType: t("documentForm.invalidFile"),
          fileTooLarge: t("documentForm.invalidFile"),
          captureFailed: t("documentForm.captureFailed"),
          saveFailed: t("documentForm.cropFailed"),
          resetCrop: t("documentForm.resetCrop"),
          cropCorner: (corner) => t("documentForm.cropCorner", { corner }),
          cropEdge: (edge) => t(`documentForm.cropEdges.${edge}`),
          identityCardHint: t("documentForm.identityCardHint"),
          identityCardDescription: t("documentForm.identityCardDescription"),
          identityCardLandscapeDescription: t(
            "documentForm.identityCardLandscapeDescription",
          ),
          rotatePhoto: t("documentForm.rotatePhoto"),
          straightenPhoto: t("documentForm.straightenPhoto"),
          resetTilt: t("documentForm.resetTilt"),
          editPhoto: t("documentForm.editPhoto"),
          cancelEdit: t("documentForm.cancelEdit"),
          rotationX: t("documentForm.rotationX"),
          rotationY: t("documentForm.rotationY"),
          adjustRotationX: t("documentForm.adjustRotationX"),
          adjustRotationY: t("documentForm.adjustRotationY"),
          resetEdits: t("documentForm.resetEdits"),
          showEntirePhoto: t("documentForm.showEntirePhoto"),
        }}
      />
    </>
  );
}

function useObjectUrl(file: File | null): string | null {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(
    null,
  );
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Object URLs are external resources; allocate only on commit and revoke on cleanup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return preview?.file === file ? preview.url : null;
}
