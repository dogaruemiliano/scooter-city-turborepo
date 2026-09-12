"use client";

import { v1 } from "@repo/api-shared";
import { aspectRatio } from "@repo/theme";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";
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
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { ImageCropper } from "@/components/ImageCropper";
import { cropImage, type CropRect } from "@/lib/crop-image";
import { DOCUMENT_PHOTO_ACCEPT } from "./constants";
import type {
  PersonDocumentPhotoDraftUpload,
  SetPersonDocumentPhoto,
} from "./types";

const FULL_IMAGE: CropRect = { x: 0, y: 0, width: 1, height: 1 };
const MAX_FILE_BYTES = 10 * 1024 * 1024;
type CameraState = "idle" | "starting" | "live" | "unavailable";

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
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState<File | null>(null);
  const [cropping, setCropping] = useState(false);
  const [crop, setCrop] = useState(FULL_IMAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  const filesRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previewUrl = useObjectUrl(upload?.file ?? null);
  const candidateUrl = useObjectUrl(candidate);
  const shownFile = candidate ?? upload?.file;
  const shownUrl = candidateUrl ?? previewUrl;
  const isPdf = shownFile?.type === "application/pdf";
  const cameraActive = cameraState === "live" || cameraState === "starting";
  const accept = acceptsPdf
    ? `${DOCUMENT_PHOTO_ACCEPT},application/pdf`
    : DOCUMENT_PHOTO_ACCEPT;
  const triggerLabel = t(
    upload ? "documentForm.changePhoto" : "documentForm.addPhoto",
    { slot: slotLabel },
  );
  const photoAlt = t("detail.documents.photoAlt", { slot: slotLabel });

  const stopCamera = useCallback(() => {
    requestRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);
  useEffect(() => {
    if (cameraState === "live" && videoRef.current)
      videoRef.current.srcObject = streamRef.current;
  }, [cameraState]);

  function changeOpen(value: boolean) {
    if (disabled || busy) return;
    stopCamera();
    setCameraState("idle");
    setCandidate(null);
    setCropping(false);
    setError(null);
    setOpen(value);
  }

  async function startCamera() {
    stopCamera();
    setCandidate(null);
    setCropping(false);
    setError(null);
    setCameraState("starting");
    const request = ++requestRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      if (!mountedRef.current || requestRef.current !== request) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraState("live");
    } catch {
      if (mountedRef.current && requestRef.current === request)
        setCameraState("unavailable");
    }
  }

  function stageFile(file: File | null) {
    if (!file || disabled || busy) return;
    setOpen(true);
    stopCamera();
    setCameraState("idle");
    if (
      !accept.split(",").includes(file.type) ||
      file.size === 0 ||
      file.size > MAX_FILE_BYTES
    ) {
      setError(t("documentForm.invalidFile"));
      return;
    }
    setError(null);
    setCandidate(file);
    setCrop(FULL_IMAGE);
    setCropping(false);
  }
  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    stageFile(event.target.files?.[0] ?? null);
    event.currentTarget.value = "";
  }
  function dropFile(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    stageFile(event.dataTransfer.files[0] ?? null);
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError(t("documentForm.captureFailed"));
      return;
    }
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!mountedRef.current) return;
      if (!blob) throw new Error("Capture failed");
      stopCamera();
      setCameraState("idle");
      setCandidate(
        new File([blob], `document-${slot}-${Date.now()}.jpg`, {
          type: "image/jpeg",
        }),
      );
      setCrop(FULL_IMAGE);
      setCropping(true);
    } catch {
      if (mountedRef.current) setError(t("documentForm.captureFailed"));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  async function saveFile() {
    if (!candidate || busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      const file = cropping ? await cropImage(candidate, crop) : candidate;
      if (!mountedRef.current) return;
      onSetDocumentPhoto(
        documentKey,
        slot,
        file,
        cropping ? candidate : undefined,
      );
      stopCamera();
      setOpen(false);
    } catch {
      if (mountedRef.current) setError(t("documentForm.cropFailed"));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  function beginCrop() {
    const source = candidate ?? upload?.originalFile ?? upload?.file;
    if (!source || source.type === "application/pdf") return;
    setCandidate(source);
    setCrop(FULL_IMAGE);
    setCropping(true);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <div
        className="relative min-w-0"
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={dropFile}
      >
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              aria-label={triggerLabel}
              disabled={disabled}
              style={{ aspectRatio: aspectRatio.documentLandscape }}
              className={`group relative h-auto w-full overflow-hidden rounded-lg p-0 whitespace-normal md:h-auto ${dragging ? "border-primary bg-accent" : ""}`}
            />
          }
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
        </DialogTrigger>
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
      </div>
      <DialogContent
        showCloseButton={false}
        className="inset-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none"
        onDragOver={(event) => event.preventDefault()}
        onDrop={dropFile}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border p-4">
          <DialogTitle>
            {cropping
              ? t("documentForm.cropPhoto")
              : t("documentForm.photoSheetTitle", { slot: slotLabel })}
          </DialogTitle>
          <Button
            type="button"
            variant="text"
            disabled={busy}
            onClick={() => changeOpen(false)}
          >
            {t("actions.cancel")}
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          {cropping && candidateUrl ? (
            <>
              <p className="px-4 pt-3 text-sm text-muted-foreground">
                {t("documentForm.cropHelp")}
              </p>
              <ImageCropper
                compact
                sourceUrl={candidateUrl}
                crop={crop}
                onCropChange={setCrop}
                imageAlt={photoAlt}
                cornerLabel={(corner) =>
                  t("documentForm.cropCorner", { corner })
                }
              />
            </>
          ) : cameraActive ? (
            <div className="relative flex min-h-0 flex-1">
              <video
                ref={videoRef}
                aria-label={t("documentForm.cameraPreview", {
                  slot: slotLabel,
                })}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-contain"
              />
              {cameraState === "starting" ? (
                <p role="status" className="m-auto p-4">
                  {t("documentForm.cameraStarting")}
                </p>
              ) : null}
            </div>
          ) : shownUrl && shownFile ? (
            isPdf ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                <object
                  data={shownUrl}
                  type="application/pdf"
                  aria-label={shownFile.name}
                  className="min-h-0 w-full flex-1"
                >
                  <FileTextIcon aria-hidden="true" />
                </object>
                <a
                  href={shownUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-center text-primary underline"
                >
                  {t("documentForm.openFile")} — {shownFile.name}
                </a>
              </div>
            ) : (
              <div className="relative min-h-0 flex-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- local document preview. */}
                <img
                  src={shownUrl}
                  alt={photoAlt}
                  className="absolute inset-0 h-full w-full object-contain p-4"
                />
              </div>
            )
          ) : (
            <div className="m-auto grid justify-items-center gap-3 p-4 text-center text-muted-foreground">
              <ImagePlusIcon className="size-10" aria-hidden="true" />
              <p>{t("documentForm.dropFile")}</p>
            </div>
          )}
        </div>
        <div className="grid shrink-0 gap-3 border-t border-border bg-popover p-4 pb-[max(var(--spacing-4),env(safe-area-inset-bottom))] text-popover-foreground">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {cameraState === "unavailable" ? (
            <p role="alert" className="text-sm">
              {t("documentForm.cameraUnavailableDescription")}
            </p>
          ) : null}
          <input
            ref={filesRef}
            id={`${inputId}-files`}
            type="file"
            accept={accept}
            aria-label={t("documentForm.chooseFromFiles")}
            className="hidden"
            disabled={busy || disabled}
            onChange={selectFile}
          />
          {isMobile ? (
            <input
              ref={galleryRef}
              id={`${inputId}-gallery`}
              type="file"
              accept={DOCUMENT_PHOTO_ACCEPT}
              aria-label={t("documentForm.chooseFromGallery")}
              className="hidden"
              disabled={busy || disabled}
              onChange={selectFile}
            />
          ) : null}
          <div className="flex flex-wrap justify-center gap-2">
            {!cropping && !cameraActive ? (
              <>
                {isMobile ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || disabled}
                      onClick={() => void startCamera()}
                    >
                      <CameraIcon aria-hidden="true" />
                      {t("documentForm.takePhoto")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || disabled}
                      onClick={() => galleryRef.current?.click()}
                    >
                      {t("documentForm.chooseFromGallery")}
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || disabled}
                  onClick={() => filesRef.current?.click()}
                >
                  <FileTextIcon aria-hidden="true" />
                  {t("documentForm.chooseFromFiles")}
                </Button>
                {shownFile && !isPdf ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || disabled}
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
                    disabled={busy || disabled}
                    onClick={() => {
                      onSetDocumentPhoto(documentKey, slot, null);
                      setCandidate(null);
                      setError(null);
                    }}
                  >
                    <Trash2Icon aria-hidden="true" />
                    {t("documentForm.removePhoto", { slot: slotLabel })}
                  </Button>
                ) : null}
              </>
            ) : null}
            {cameraActive ? (
              <Button
                type="button"
                disabled={busy || cameraState !== "live"}
                onClick={() => void capturePhoto()}
              >
                <CameraIcon aria-hidden="true" />
                {t("documentForm.capturePhoto")}
              </Button>
            ) : null}
            {candidate ? (
              <Button
                type="button"
                disabled={busy || disabled}
                onClick={() => void saveFile()}
              >
                {t(
                  cropping
                    ? "documentForm.saveCrop"
                    : isPdf
                      ? "documentForm.useFile"
                      : "documentForm.usePhoto",
                )}
              </Button>
            ) : null}
            {cropping || cameraActive ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  stopCamera();
                  setCameraState("idle");
                  setCropping(false);
                }}
              >
                {t("wizard.back")}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
