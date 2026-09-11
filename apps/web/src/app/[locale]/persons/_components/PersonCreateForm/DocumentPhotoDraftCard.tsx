"use client";

import { v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  Button,
} from "@repo/ui/components";
import {
  CameraIcon,
  CheckIcon,
  CircleAlertIcon,
  FileTextIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { DOCUMENT_PHOTO_ACCEPT } from "./constants";
import type {
  PersonDocumentPhotoDraftUpload,
  SetPersonDocumentPhoto,
} from "./types";

type CameraState = "idle" | "starting" | "live" | "unavailable";

export function DocumentPhotoDraftCard({
  inputId,
  documentKey,
  slot,
  slotLabel,
  upload,
  disabled,
  onSetDocumentPhoto,
  acceptsPdf = false,
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
  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState<File | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [captureFailed, setCaptureFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useObjectUrl(upload?.file ?? null);
  const candidateUrl = useObjectUrl(candidate);
  const hasPhoto = Boolean(upload && previewUrl);
  const hasUploadedPhoto = upload?.status === "uploaded";
  const triggerLabel = hasPhoto
    ? t(acceptsPdf ? "documentForm.changeFile" : "documentForm.changePhoto", {
        slot: slotLabel,
      })
    : t(acceptsPdf ? "documentForm.addFile" : "documentForm.addPhoto", {
        slot: slotLabel,
      });
  const photoAlt = t("detail.documents.photoAlt", { slot: slotLabel });

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCaptureFailed(false);
    setCameraState("starting");
    const requestId = ++cameraRequestRef.current;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API unavailable");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });

      if (!mountedRef.current || cameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      setCameraState("live");
    } catch {
      if (mountedRef.current && cameraRequestRef.current === requestId) {
        setCameraState("unavailable");
      }
    }
  }, [stopCamera]);

  useEffect(() => {
    if (cameraState !== "live" || !streamRef.current || !videoRef.current) {
      return;
    }

    videoRef.current.srcObject = streamRef.current;
  }, [cameraState]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  function changeOpen(nextOpen: boolean) {
    if (disabled) return;

    setOpen(nextOpen);
    if (nextOpen) {
      setCandidate(null);
      void startCamera();
    } else {
      stopCamera();
    }
  }

  function finishOpenChange(nextOpen: boolean) {
    if (nextOpen) return;

    setCandidate(null);
    setCaptureFailed(false);
    setCameraState("idle");
  }

  function stageSelectedFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;

    stopCamera();
    setCameraState("idle");
    setCaptureFailed(false);
    setCandidate(file);
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      stopCamera();
      setCameraState("idle");
      setCaptureFailed(true);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      stopCamera();
      setCameraState("idle");
      setCaptureFailed(true);
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopCamera();
    setCameraState("idle");

    const blob = await canvasToJpeg(canvas);
    if (!mountedRef.current) return;
    if (!blob) {
      setCaptureFailed(true);
      return;
    }

    setCaptureFailed(false);
    setCandidate(
      new File([blob], `document-${slot}-${Date.now()}.jpg`, {
        type: "image/jpeg",
      }),
    );
  }

  function retakePhoto() {
    setCandidate(null);
    void startCamera();
  }

  function usePhoto() {
    if (!candidate) return;

    onSetDocumentPhoto(documentKey, slot, candidate);
    stopCamera();
    setOpen(false);
  }

  function removePhoto() {
    onSetDocumentPhoto(documentKey, slot, null);
    stopCamera();
    setOpen(false);
  }

  function retryUpload() {
    if (upload?.status !== "failed") return;

    onSetDocumentPhoto(documentKey, slot, upload.file);
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={changeOpen}
      onOpenChangeComplete={finishOpenChange}
    >
      <div className="relative min-w-0">
        <BottomSheetTrigger
          render={
            <Button
              type="button"
              variant="outline"
              aria-label={triggerLabel}
              disabled={disabled}
              className="group relative h-40 w-full justify-start overflow-hidden rounded-lg p-0 text-left whitespace-normal md:h-40"
            />
          }
        >
          {hasPhoto && upload?.file.type === "application/pdf" ? (
            <span className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
              <FileTextIcon
                aria-hidden="true"
                className="size-7 text-muted-foreground"
              />
              <span className="max-w-full truncate text-sm font-medium">
                {upload.file.name}
              </span>
              <span className="text-xs text-muted-foreground">PDF</span>
            </span>
          ) : hasPhoto && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- draft previews use temporary object URLs.
            <img
              src={previewUrl}
              alt={photoAlt}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
              <ImagePlusIcon
                aria-hidden="true"
                className="size-7 text-muted-foreground"
              />
              <span className="text-sm font-medium text-foreground">
                {triggerLabel}
              </span>
              <span className="text-xs text-muted-foreground">
                {acceptsPdf
                  ? t("documentForm.fileTypesShort")
                  : t("detail.documents.photoFileTypesShort")}
              </span>
            </span>
          )}

          <span className="absolute top-2 left-2">
            <Badge variant={hasPhoto ? "secondary" : "outline"}>
              {hasPhoto ? <CheckIcon aria-hidden="true" /> : null}
              {hasPhoto ? slotLabel : t("detail.documents.missingPhoto")}
            </Badge>
          </span>
        </BottomSheetTrigger>
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
              onClick={retryUpload}
            >
              <RotateCcwIcon aria-hidden="true" />
            </Button>
            <span
              aria-hidden="true"
              className="text-sm font-medium text-scrim-foreground"
            >
              {t("documentForm.retryUpload")}
            </span>
          </div>
        ) : null}
      </div>

      <BottomSheetContent className="lg:w-xl">
        <BottomSheetHeader>
          <BottomSheetTitle>
            {acceptsPdf
              ? t("documentForm.fileSheetTitle", { slot: slotLabel })
              : t("documentForm.photoSheetTitle", { slot: slotLabel })}
          </BottomSheetTitle>
        </BottomSheetHeader>

        <BottomSheetBody>
          <div
            data-base-ui-swipe-ignore
            className="relative h-64 overflow-hidden rounded-lg bg-muted sm:h-72"
          >
            {candidateUrl && candidate?.type === "application/pdf" ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
                <FileTextIcon
                  aria-hidden="true"
                  className="size-10 text-muted-foreground"
                />
                <p className="max-w-full truncate text-sm font-medium">
                  {candidate.name}
                </p>
                <a
                  href={candidateUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline"
                >
                  {t("documentForm.openFile")}
                </a>
              </div>
            ) : candidateUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- staged previews use temporary object URLs.
              <img
                src={candidateUrl}
                alt={photoAlt}
                className="h-full w-full object-contain"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  aria-label={t("documentForm.cameraPreview", {
                    slot: slotLabel,
                  })}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
                {cameraState === "starting" ? (
                  <span
                    role="status"
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted text-sm text-muted-foreground"
                  >
                    <LoaderCircleIcon
                      aria-hidden="true"
                      className="size-6 animate-spin [animation-duration:var(--duration-countdown-tick)] motion-reduce:animate-none"
                    />
                    {t("documentForm.cameraStarting")}
                  </span>
                ) : null}
                {cameraState === "unavailable" ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <CameraIcon
                      aria-hidden="true"
                      className="size-10 text-muted-foreground"
                    />
                  </span>
                ) : null}
              </>
            )}
          </div>

          {cameraState === "unavailable" && !candidate ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>
                {t("documentForm.cameraUnavailableTitle")}
              </AlertTitle>
              <AlertDescription>
                {t("documentForm.cameraUnavailableDescription")}
              </AlertDescription>
            </Alert>
          ) : null}

          {captureFailed ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertDescription>
                {t("documentForm.captureFailed")}
              </AlertDescription>
            </Alert>
          ) : null}

          <input
            ref={galleryInputRef}
            id={`${inputId}-gallery`}
            type="file"
            accept="image/*"
            aria-label={t("documentForm.chooseFromGallery")}
            className="hidden"
            disabled={disabled}
            onChange={stageSelectedFile}
          />
          <input
            ref={filesInputRef}
            id={`${inputId}-files`}
            type="file"
            accept={
              acceptsPdf
                ? `${DOCUMENT_PHOTO_ACCEPT},application/pdf`
                : DOCUMENT_PHOTO_ACCEPT
            }
            aria-label={t("documentForm.chooseFromFiles")}
            className="hidden"
            disabled={disabled}
            onChange={stageSelectedFile}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => galleryInputRef.current?.click()}
            >
              <ImagePlusIcon data-icon="inline-start" />
              {t("documentForm.chooseFromGallery")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => filesInputRef.current?.click()}
            >
              <FileTextIcon data-icon="inline-start" />
              {t("documentForm.chooseFromFiles")}
            </Button>
          </div>
          {hasUploadedPhoto ? (
            <Button
              type="button"
              variant="text"
              className="self-start text-destructive hover:text-destructive-hover active:text-destructive-active"
              disabled={disabled}
              onClick={removePhoto}
            >
              <Trash2Icon data-icon="inline-start" />
              {t("documentForm.removePhoto", { slot: slotLabel })}
            </Button>
          ) : null}
        </BottomSheetBody>

        <BottomSheetFooter className="sm:flex-row-reverse sm:justify-start">
          {candidate ? (
            <>
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={disabled}
                onClick={usePhoto}
              >
                <CheckIcon data-icon="inline-start" />
                {t(
                  candidate?.type === "application/pdf"
                    ? "documentForm.useFile"
                    : "documentForm.usePhoto",
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={disabled}
                onClick={retakePhoto}
              >
                <RotateCcwIcon data-icon="inline-start" />
                {t("documentForm.retakePhoto")}
              </Button>
            </>
          ) : cameraState === "starting" || cameraState === "live" ? (
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={disabled || cameraState !== "live"}
              onClick={() => void capturePhoto()}
            >
              <CameraIcon data-icon="inline-start" />
              {t("documentForm.takePhoto")}
            </Button>
          ) : captureFailed || cameraState === "unavailable" ? (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={disabled}
              onClick={retakePhoto}
            >
              <RotateCcwIcon data-icon="inline-start" />
              {cameraState === "unavailable"
                ? t("documentForm.retryCamera")
                : t("documentForm.retakePhoto")}
            </Button>
          ) : null}

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
      </BottomSheetContent>
    </BottomSheet>
  );
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
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
