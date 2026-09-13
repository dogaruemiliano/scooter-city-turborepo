"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCwSquareIcon, XIcon } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { ImageCropper } from "@repo/ui/components/image-cropper";
import {
  ImageRotationIcon,
  type ImageRotationAxis,
} from "@repo/ui/components/image-rotation-icon";
import { ImageTiltControl } from "@repo/ui/components/image-tilt-control";
import { Spinner } from "@repo/ui/components/spinner";
import { useImageEditorLayout } from "@repo/ui/hooks/use-image-editor-layout";
import {
  cropImage,
  rotateImage,
  DEFAULT_IMAGE_CROP,
  type CropCorner,
  type CropEdge,
  type CropRect,
} from "@repo/ui/lib/crop-image";
import { cn } from "@repo/ui/lib/utils";

export interface ImageEditorLabels {
  title: string;
  description: string;
  cancel: string;
  reset: string;
  rotatePhoto: string;
  rotationZ: string;
  rotationX: string;
  rotationY: string;
  adjustRotationZ: string;
  adjustRotationX: string;
  adjustRotationY: string;
  imageAlt: string;
  cropCorner: (corner: CropCorner) => string;
  cropEdge: (edge: CropEdge) => string;
  showEntirePhoto: string;
  save: string;
  saving: string;
  saveFailed: string;
  fileTooLarge: string;
}

const DEFAULT_LABELS: ImageEditorLabels = {
  title: "Edit photo",
  description:
    "Drag the corners to crop, or select a rotation axis and adjust the ruler.",
  cancel: "Cancel editing",
  reset: "Reset",
  rotatePhoto: "Rotate photo 90°",
  rotationZ: "Straighten",
  rotationX: "Vertical perspective",
  rotationY: "Horizontal perspective",
  adjustRotationZ: "Straighten photo",
  adjustRotationX: "Adjust vertical perspective",
  adjustRotationY: "Adjust horizontal perspective",
  imageAlt: "Selected photo",
  cropCorner: (corner) => `Resize ${corner} corner`,
  cropEdge: (edge) => `Resize ${edge} edge`,
  showEntirePhoto: "Show entire photo",
  save: "Done",
  saving: "Saving…",
  saveFailed: "Could not save the photo. Please try again.",
  fileTooLarge: "This file is too large.",
};

export interface ImageEditorProps {
  file: File;
  onCancel: () => void;
  onSave: (file: File, details: { originalFile: File }) => void | Promise<void>;
  maxEdge?: number;
  quality?: number;
  maxFileSize?: number;
  labels?: Partial<ImageEditorLabels>;
}

const AXES: readonly ImageRotationAxis[] = ["z", "x", "y"];
const ZERO_ROTATION = { z: 0, x: 0, y: 0 };

/** Standalone editor. Mount with an original file; cancel never changes that file. */
export function ImageEditor({
  file,
  onCancel,
  onSave,
  maxEdge,
  quality,
  maxFileSize = 10 * 1024 * 1024,
  labels: overrides,
}: ImageEditorProps) {
  const labels = { ...DEFAULT_LABELS, ...overrides };
  const { headerRef, controlsRef, insets } = useImageEditorLayout();
  const [source, setSource] = useState({ file, quarterTurns: 0 });
  const [preview, setPreview] = useState<{ file: File; url: string }>();
  const sourceUrl = preview?.file === source.file ? preview.url : undefined;
  const [crop, setCrop] = useState<CropRect>(DEFAULT_IMAGE_CROP);
  const [rotation, setRotation] = useState(ZERO_ROTATION);
  const [axis, setAxis] = useState<ImageRotationAxis>("z");
  const [viewResetKey, setViewResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string>();
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    const url = URL.createObjectURL(source.file);
    setPreview({ file: source.file, url });
    return () => URL.revokeObjectURL(url);
  }, [source.file]);

  const axisLabels = {
    z: labels.rotationZ,
    x: labels.rotationX,
    y: labels.rotationY,
  };
  const rulerLabels = {
    z: labels.adjustRotationZ,
    x: labels.adjustRotationX,
    y: labels.adjustRotationY,
  };

  function reset() {
    if (busyRef.current) return;
    setSource({ file, quarterTurns: 0 });
    setCrop(DEFAULT_IMAGE_CROP);
    setRotation(ZERO_ROTATION);
    setAxis("z");
    setViewResetKey((key) => key + 1);
    setError(undefined);
  }

  function cancel() {
    if (!busyRef.current) onCancel();
  }

  async function rotateQuarterTurn() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setRotating(true);
    setError(undefined);
    try {
      const quarterTurns = (source.quarterTurns + 1) % 4;
      const rotated = await rotateImage(file, quarterTurns, { quality });
      if (!mountedRef.current) return;
      setSource({ file: rotated, quarterTurns });
      setCrop(DEFAULT_IMAGE_CROP);
      setViewResetKey((key) => key + 1);
    } catch {
      if (mountedRef.current) setError(labels.saveFailed);
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
        setRotating(false);
      }
    }
  }

  const [zoomOutContainer, setZoomOutContainer] =
    useState<HTMLDivElement | null>(null);

  async function save() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const output = await cropImage(file, crop, {
        quarterTurns: source.quarterTurns,
        tiltDegrees: rotation.z,
        rotationX: rotation.x,
        rotationY: rotation.y,
        fixedFrame: true,
        maxEdge,
        quality,
      });
      if (!mountedRef.current) return;
      if (output.size === 0 || output.size > maxFileSize) {
        setError(labels.fileTooLarge);
        return;
      }
      await onSave(output, { originalFile: file });
    } catch (caught) {
      if (mountedRef.current)
        setError(caught instanceof Error ? caught.message : labels.saveFailed);
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-busy={busy}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => event.preventDefault()}
        className="top-0 left-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 text-foreground sm:max-w-none"
      >
        <DialogTitle className="sr-only">{labels.title}</DialogTitle>
        <DialogDescription className="sr-only">
          {labels.description}
        </DialogDescription>
        <header
          ref={headerRef}
          className="absolute inset-x-0 top-0 z-raised grid grid-cols-[1fr_auto_1fr] items-center pr-[calc(env(safe-area-inset-right)+var(--spacing-4))] pl-[calc(env(safe-area-inset-left)+var(--spacing-4))] pt-[calc(env(safe-area-inset-top)+var(--spacing-3))] pb-3"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="justify-self-start bg-background"
            aria-label={labels.cancel}
            disabled={busy}
            onClick={cancel}
          >
            <XIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="text"
            disabled={busy}
            onClick={reset}
            className="bg-background text-primary hover:text-primary-hover active:text-primary-active"
          >
            {labels.reset}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="justify-self-end bg-background"
            aria-label={labels.rotatePhoto}
            title={labels.rotatePhoto}
            disabled={busy}
            onClick={() => void rotateQuarterTurn()}
          >
            {rotating ? <Spinner /> : <RotateCwSquareIcon aria-hidden="true" />}
          </Button>
        </header>
        <div
          data-slot="image-editor-viewport"
          className="absolute inset-0 overflow-hidden"
          inert={busy}
        >
          {sourceUrl ? (
            <ImageCropper
              sourceUrl={sourceUrl}
              crop={crop}
              onCropChange={setCrop}
              tiltDegrees={rotation.z}
              rotationX={rotation.x}
              rotationY={rotation.y}
              fixedFrame
              imageAlt={labels.imageAlt}
              cornerLabel={labels.cropCorner}
              edgeLabel={labels.cropEdge}
              zoomOutLabel={labels.showEntirePhoto}
              zoomOutContainer={zoomOutContainer}
              viewResetKey={viewResetKey}
              fullViewport
              viewportInsets={insets}
              compact
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Spinner />
            </div>
          )}
        </div>
        <div
          ref={controlsRef}
          data-slot="image-editor-controls"
          className="absolute inset-x-0 bottom-0 z-raised pt-2 pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
        >
          <div
            className="flex items-center justify-center gap-8 pb-2"
            role="group"
            aria-label={labels.title}
          >
            {AXES.map((item) => (
              <Button
                key={item}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={axisLabels[item]}
                title={axisLabels[item]}
                aria-pressed={axis === item}
                disabled={busy}
                onClick={() => setAxis(item)}
                className={cn(
                  "rounded-full border bg-background hover:bg-muted",
                  axis === item
                    ? "border-primary text-primary hover:text-primary"
                    : "border-transparent text-foreground",
                )}
              >
                <ImageRotationIcon axis={item} />
              </Button>
            ))}
          </div>
          <ImageTiltControl
            key={axis}
            value={rotation[axis]}
            onValueChange={(value) =>
              setRotation((current) => ({ ...current, [axis]: value }))
            }
            disabled={busy}
            label={rulerLabels[axis]}
            min={axis === "z" ? -15 : -45}
            max={axis === "z" ? 15 : 45}
            overlay
          />
          {error ? (
            <p
              role="alert"
              className="mx-auto w-fit rounded-md bg-background px-4 py-2 text-center text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <footer className="flex items-center justify-between gap-4 px-6 pt-2 pb-[calc(env(safe-area-inset-bottom)+var(--spacing-6))]">
            <div
              ref={setZoomOutContainer}
              inert={busy}
              className="size-12 shrink-0"
            />
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy && !rotating ? (
                <>
                  <Spinner />
                  {labels.saving}
                </>
              ) : (
                labels.save
              )}
            </Button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
