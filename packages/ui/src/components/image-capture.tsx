"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CameraIcon,
  FileIcon,
  ImagesIcon,
  PencilIcon,
  SwitchCameraIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  IdentityCardGuide,
  IdentityCardOrientationCue,
} from "@repo/ui/components/identity-card-guide";
import { ImageEditor } from "@repo/ui/components/image-editor";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/popover";
import { Spinner } from "@repo/ui/components/spinner";
import { useCameraPreviewLayout } from "@repo/ui/hooks/use-camera-preview-layout";
import { cn } from "@repo/ui/lib/utils";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";
import {
  captureCameraFrame,
  useCaptureCamera,
} from "@repo/ui/hooks/use-capture-camera";
import type { CropCorner } from "@repo/ui/lib/crop-image";

export interface ImageCaptureLabels {
  title: string;
  close: string;
  capture: string;
  choosePhoto: string;
  gallery: string;
  files: string;
  switchCamera: string;
  startingCamera: string;
  cameraUnavailable: string;
  retryCamera: string;
  cropTitle: string;
  cropHint: string;
  previewTitle: string;
  previewAlt: string;
  retake: string;
  usePhoto: string;
  useFile: string;
  rotatePhoto: string;
  straightenPhoto: string;
  resetTilt: string;
  editPhoto: string;
  cancelEdit: string;
  rotationX: string;
  rotationY: string;
  adjustRotationX: string;
  adjustRotationY: string;
  resetEdits: string;
  showEntirePhoto: string;
  identityCardHint: string;
  identityCardDescription: string;
  identityCardLandscapeDescription: string;
  processing: string;
  unsupportedType: string;
  fileTooLarge: string;
  captureFailed: string;
  saveFailed: string;
  resetCrop: string;
  cropCorner: (corner: CropCorner) => string;
}

const DEFAULT_LABELS: ImageCaptureLabels = {
  title: "Add a photo",
  close: "Close camera",
  capture: "Take photo",
  choosePhoto: "Choose from gallery or files",
  gallery: "Gallery",
  files: "Files",
  switchCamera: "Switch camera",
  startingCamera: "Starting camera…",
  cameraUnavailable:
    "Camera unavailable. Allow camera access in your browser to take a photo.",
  retryCamera: "Try camera again",
  cropTitle: "Crop photo",
  cropHint: "Drag the corners to keep what matters.",
  previewTitle: "Review photo",
  previewAlt: "Selected photo",
  retake: "Retake",
  usePhoto: "Use photo",
  useFile: "Use file",
  rotatePhoto: "Rotate photo 90°",
  straightenPhoto: "Straighten photo",
  resetTilt: "Reset tilt",
  editPhoto: "Edit photo",
  cancelEdit: "Cancel editing",
  rotationX: "Vertical perspective",
  rotationY: "Horizontal perspective",
  adjustRotationX: "Adjust vertical perspective",
  adjustRotationY: "Adjust horizontal perspective",
  resetEdits: "Reset",
  showEntirePhoto: "Show entire photo",
  identityCardHint: "Turn the ID, not your phone.",
  identityCardDescription:
    "Hold your phone upright. Turn the identity card 90 degrees and align it with the vertical outline, keeping all edges visible.",
  identityCardLandscapeDescription:
    "Align the identity card with the horizontal outline, keeping all edges visible.",
  processing: "Processing…",
  unsupportedType: "This file format is not supported.",
  fileTooLarge: "This file is too large.",
  captureFailed: "Could not take the photo. Please try again.",
  saveFailed: "Could not use the photo. Please try again.",
  resetCrop: "Reset crop",
  cropCorner: (corner) => `Resize ${corner} corner`,
};

export interface ImageCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the confirmed image, or an accepted non-image file unchanged. */
  onCapture: (
    file: File,
    details: { originalFile: File },
  ) => void | Promise<void>;
  /** Portrait guide for card-shaped IDs, not paper documents. */
  captureMode?: "photo" | "identity-card";
  /** Reopen an existing image for review/crop. Ignored for live-only capture. */
  initialFile?: File;
  /** Disables ALL imports, including file inputs and drag/drop, for live capture. */
  allowGallery?: boolean;
  allowCrop?: boolean;
  accept?: string;
  maxFileSize?: number;
  labels?: Partial<ImageCaptureLabels>;
  cameraActions?: ReactNode;
}

/** Fullscreen camera and image picker. No upload/API or app-specific dependencies. */
export function ImageCapture(props: ImageCaptureProps) {
  return props.open ? <ImageCaptureSession {...props} /> : null;
}

function ImageCaptureSession({
  onOpenChange,
  onCapture,
  captureMode = "photo",
  initialFile,
  allowGallery = true,
  allowCrop = true,
  accept = "image/jpeg,image/png,image/webp",
  maxFileSize = 10 * 1024 * 1024,
  labels: overrides,
  cameraActions,
}: ImageCaptureProps) {
  const labels = { ...DEFAULT_LABELS, ...overrides };
  const [source, setSource] = useState<File | undefined>(() =>
    initialFile && allowGallery ? initialFile : undefined,
  );
  const [editing, setEditing] = useState(
    Boolean(
      initialFile &&
      allowGallery &&
      allowCrop &&
      initialFile.type.startsWith("image/"),
    ),
  );
  const [preview, setPreview] = useState<{ file: File; url: string }>();
  const sourceUrl = preview?.file === source ? preview?.url : undefined;
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const galleryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const camera = useCaptureCamera(!source);
  const cameraPreview = useCameraPreviewLayout(!source, camera.frameSize);
  const isMobile = useIsMobile();
  const portraitFrame = Boolean(
    camera.frameSize && camera.frameSize.height > camera.frameSize.width,
  );
  const showOrientationCue = isMobile && portraitFrame;
  const canEdit = Boolean(source?.type.startsWith("image/") && allowCrop);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const sourceFile = source;
  useEffect(() => {
    if (!sourceFile) return;
    const url = URL.createObjectURL(sourceFile);
    setPreview({ file: sourceFile, url });
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);

  function selectFile(file: File | undefined, fromCamera = false) {
    if (!file || busyRef.current || (!fromCamera && !allowGallery)) return;
    if (!fromCamera && !acceptsFile(file, accept)) {
      setError(labels.unsupportedType);
      return;
    }
    if (file.size === 0 || file.size > maxFileSize) {
      setError(labels.fileTooLarge);
      return;
    }
    setError(undefined);
    setSource(file);
    setEditing(allowCrop && file.type.startsWith("image/"));
    setImportOpen(false);
  }

  function retakePhoto() {
    if (busyRef.current) return;
    setSource(undefined);
    setPreview(undefined);
    setEditing(false);
    setError(undefined);
  }

  async function takePhoto() {
    if (
      camera.status !== "ready" ||
      !camera.videoRef.current ||
      busyRef.current
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const file = await captureCameraFrame(camera.videoRef.current);
      if (mountedRef.current) {
        busyRef.current = false;
        selectFile(file, true);
      }
    } catch {
      if (mountedRef.current) setError(labels.captureFailed);
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  async function confirm() {
    if (!source || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const file = source;
      if (!mountedRef.current) return;
      if (file.size === 0 || file.size > maxFileSize) {
        setError(labels.fileTooLarge);
        return;
      }
      await onCapture(file, { originalFile: source });
      if (mountedRef.current) onOpenChange(false);
    } catch (caught) {
      if (mountedRef.current)
        setError(caught instanceof Error ? caught.message : labels.saveFailed);
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  if (editing && source && canEdit) {
    return (
      <ImageEditor
        file={source}
        onCancel={retakePhoto}
        onSave={async (file, details) => {
          await onCapture(file, details);
          if (mountedRef.current) onOpenChange(false);
        }}
        maxEdge={captureMode === "identity-card" ? 4096 : 2048}
        quality={captureMode === "identity-card" ? 0.92 : 0.85}
        maxFileSize={maxFileSize}
        labels={{
          title: labels.cropTitle,
          description: labels.cropHint,
          cancel: labels.cancelEdit,
          reset: labels.resetEdits,
          rotatePhoto: labels.rotatePhoto,
          rotationZ: labels.straightenPhoto,
          rotationX: labels.rotationX,
          rotationY: labels.rotationY,
          adjustRotationZ: labels.straightenPhoto,
          adjustRotationX: labels.adjustRotationX,
          adjustRotationY: labels.adjustRotationY,
          imageAlt: labels.previewAlt,
          cropCorner: labels.cropCorner,
          showEntirePhoto: labels.showEntirePhoto,
          save: labels.usePhoto,
          saving: labels.processing,
          saveFailed: labels.saveFailed,
          fileTooLarge: labels.fileTooLarge,
        }}
      />
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busyRef.current) onOpenChange(open);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-mist-950 p-0 text-mist-50 sm:max-w-none"
        onDragOver={(event) => {
          event.preventDefault();
          if (allowGallery && !busy) event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (allowGallery) selectFile(event.dataTransfer.files[0]);
        }}
        aria-busy={busy}
      >
        <DialogTitle className="sr-only">
          {source ? labels.previewTitle : labels.title}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {labels.title}
        </DialogDescription>
        {!source ? (
          <div
            ref={cameraPreview.stageRef}
            className="absolute inset-0"
            data-slot="camera-stage"
          >
            <div
              data-slot="camera-preview-frame"
              className={cn(
                "absolute overflow-hidden",
                !cameraPreview.layout && "inset-0",
              )}
              style={
                cameraPreview.layout
                  ? {
                      left: cameraPreview.layout.left,
                      top: cameraPreview.layout.top,
                      width: cameraPreview.layout.width,
                      height: cameraPreview.layout.height,
                    }
                  : undefined
              }
            >
              <video
                ref={camera.attachVideo}
                autoPlay
                muted
                playsInline
                className="size-full object-contain"
                onLoadedData={camera.markReady}
                onCanPlay={camera.markReady}
                onResize={camera.updateFrameSize}
                onError={camera.markUnavailable}
                aria-label={labels.title}
              />
              {camera.status === "ready" && captureMode === "identity-card" ? (
                <div
                  className="absolute inset-x-0"
                  style={{
                    top: cameraPreview.layout?.guideTopInset ?? 0,
                    bottom: cameraPreview.layout?.guideBottomInset ?? 0,
                  }}
                >
                  <IdentityCardGuide
                    description={
                      portraitFrame
                        ? labels.identityCardDescription
                        : labels.identityCardLandscapeDescription
                    }
                    portrait={portraitFrame}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <header
          ref={cameraPreview.headerRef}
          className={cn(
            "z-raised flex shrink-0 items-center justify-between gap-3 pr-[calc(env(safe-area-inset-right)+var(--spacing-4))] pl-[calc(env(safe-area-inset-left)+var(--spacing-4))] pt-[calc(env(safe-area-inset-top)+var(--spacing-3))] pb-3",
            source ? "relative" : "absolute inset-x-0 top-0",
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={labels.close}
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="rounded-full bg-mist-950/60 text-mist-50 hover:bg-mist-950 hover:text-mist-50"
          >
            <XIcon aria-hidden="true" />
          </Button>
          {!source &&
          showOrientationCue &&
          camera.status === "ready" &&
          captureMode === "identity-card" ? (
            <IdentityCardOrientationCue hint={labels.identityCardHint} />
          ) : null}
          {source ? (
            <h2 className="text-base font-medium">{labels.previewTitle}</h2>
          ) : null}
          {canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={labels.editPhoto}
              onClick={() => setEditing(true)}
              className="rounded-full text-mist-50 hover:bg-mist-50/10 hover:text-mist-50"
            >
              <PencilIcon aria-hidden="true" />
            </Button>
          ) : source ? (
            <span className="size-12" aria-hidden="true" />
          ) : null}
        </header>
        {source ? (
          <>
            <div
              className="flex min-h-0 flex-1 flex-col overflow-hidden pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
              inert={busy}
            >
              {!sourceUrl ? (
                <div className="flex flex-1 items-center justify-center">
                  <Spinner />
                </div>
              ) : source.type === "application/pdf" ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4">
                  <FileIcon className="size-12" aria-hidden="true" />
                  <p className="max-w-full truncate text-sm">{source.name}</p>
                  <iframe
                    src={sourceUrl}
                    title={source.name}
                    className="min-h-0 w-full flex-1 border-0"
                  />
                </div>
              ) : (
                <img
                  src={sourceUrl}
                  alt={labels.previewAlt}
                  className="min-h-0 flex-1 object-contain px-4"
                />
              )}
            </div>
            {error ? (
              <p
                role="alert"
                className="shrink-0 px-4 pt-2 text-center text-sm text-mist-50"
              >
                {error}
              </p>
            ) : null}
            <footer className="relative grid shrink-0 grid-cols-2 gap-4 pr-[calc(env(safe-area-inset-right)+var(--spacing-6))] pl-[calc(env(safe-area-inset-left)+var(--spacing-6))] pt-4 pb-[calc(env(safe-area-inset-bottom)+var(--spacing-8))]">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={retakePhoto}
                className="text-mist-50 hover:bg-mist-50/10 hover:text-mist-50"
              >
                {labels.retake}
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void confirm()}
              >
                {busy ? (
                  <>
                    <Spinner />
                    {labels.processing}
                  </>
                ) : source.type.startsWith("image/") ? (
                  labels.usePhoto
                ) : (
                  labels.useFile
                )}
              </Button>
            </footer>
          </>
        ) : (
          <>
            <div className="pointer-events-none relative flex min-h-0 flex-1 items-center justify-center px-8">
              {camera.status !== "ready" ? (
                <div
                  className="pointer-events-auto flex max-w-96 flex-col items-center gap-4 rounded-xl bg-mist-950/80 p-6 text-center"
                  role="status"
                >
                  {camera.status === "starting" ? (
                    <>
                      <Spinner className="size-8" />
                      <p>{labels.startingCamera}</p>
                    </>
                  ) : (
                    <>
                      <CameraIcon className="size-8" aria-hidden="true" />
                      <p>{labels.cameraUnavailable}</p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={camera.retry}
                      >
                        {labels.retryCamera}
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
            <footer
              ref={cameraPreview.controlsRef}
              className="absolute inset-x-0 bottom-0 shrink-0 pr-[calc(env(safe-area-inset-right)+var(--spacing-6))] pl-[calc(env(safe-area-inset-left)+var(--spacing-6))] pt-2 pb-[calc(env(safe-area-inset-bottom)+var(--spacing-6))]"
            >
              {error ? (
                <p
                  role="alert"
                  className="mx-auto mb-2 w-fit rounded-md bg-mist-950/80 px-3 py-2 text-center text-sm"
                >
                  {error}
                </p>
              ) : null}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
                <div className="flex justify-center">
                  {allowGallery ? (
                    <Popover open={importOpen} onOpenChange={setImportOpen}>
                      <PopoverTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            aria-label={labels.choosePhoto}
                            className="rounded-full bg-mist-950/60 text-mist-50 hover:bg-mist-950/80 hover:text-mist-50 aria-expanded:bg-mist-950/80"
                          />
                        }
                      >
                        <ImagesIcon aria-hidden="true" />
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="start"
                        className="w-64 gap-1"
                      >
                        {isMobile ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="justify-start"
                            onClick={() => {
                              galleryRef.current?.click();
                              setImportOpen(false);
                            }}
                          >
                            <ImagesIcon data-icon="inline-start" />
                            {labels.gallery}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          className="justify-start"
                          onClick={() => {
                            filesRef.current?.click();
                            setImportOpen(false);
                          }}
                        >
                          <FileIcon data-icon="inline-start" />
                          {labels.files}
                        </Button>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label={labels.capture}
                  disabled={camera.status !== "ready" || busy}
                  onClick={() => void takePhoto()}
                  className="flex size-20 items-center justify-center rounded-full border-4 border-mist-50 bg-mist-950/60 p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-mist-950 disabled:opacity-50"
                >
                  <span
                    className="size-full rounded-full bg-mist-50"
                    aria-hidden="true"
                  />
                </button>
                <div className="flex justify-center">
                  {cameraActions ? (
                    <div className="rounded-full bg-mist-950/60">
                      {cameraActions}
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy || camera.status === "starting"}
                      aria-label={labels.switchCamera}
                      onClick={camera.switchCamera}
                      className="rounded-full bg-mist-950/60 text-mist-50 hover:bg-mist-950/80 hover:text-mist-50"
                    >
                      <SwitchCameraIcon aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            </footer>
          </>
        )}
        {allowGallery ? (
          <>
            {isMobile ? (
              <input
                ref={galleryRef}
                type="file"
                accept={accept
                  .split(",")
                  .filter((type) => type.trim().startsWith("image/"))
                  .join(",")}
                className="hidden"
                aria-label={labels.gallery}
                onChange={(event) => {
                  selectFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            ) : null}
            <input
              ref={filesRef}
              type="file"
              accept={accept}
              className="hidden"
              aria-label={labels.files}
              onChange={(event) => {
                selectFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function acceptsFile(file: File, accept: string): boolean {
  return accept.split(",").some((entry) => {
    const type = entry.trim().toLowerCase();
    if (type.startsWith(".")) return file.name.toLowerCase().endsWith(type);
    if (type.endsWith("/*"))
      return file.type.toLowerCase().startsWith(type.slice(0, -1));
    return file.type.toLowerCase() === type;
  });
}
