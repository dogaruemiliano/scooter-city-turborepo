"use client";

import { magnification, spacing } from "@repo/theme";
import { ZoomOutIcon } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import {
  getProjectedImageGeometry,
  resizeCropRect,
  type CropCorner,
  type CropRect,
} from "../lib/crop-image";
import { cn } from "../lib/utils";
import {
  fitCropPreview,
  previewDeltaToCropDelta,
  type CropPreviewLayout,
} from "../lib/crop-preview-layout";

export interface ImageCropperProps {
  sourceUrl: string;
  crop: CropRect;
  onCropChange: (crop: CropRect) => void;
  imageAlt: string;
  cornerLabel: (corner: CropCorner) => string;
  compact?: boolean;
  className?: string;
  imageClassName?: string;
  /** Fine clockwise correction, in degrees, shown without encoding the source. */
  tiltDegrees?: number;
  /** Perspective corrections around the horizontal and vertical image axes. */
  rotationX?: number;
  rotationY?: number;
  /** Rotate the image beneath a stable crop frame. Match this option on export. */
  fixedFrame?: boolean;
  zoomOutLabel?: string;
  showZoomOut?: boolean;
  /** Restores the initial preview on an explicit reset, including an unchanged crop. */
  viewResetKey?: number;
  /** Draw the image and mask across the full editor, behind floating controls. */
  fullViewport?: boolean;
  viewportInsets?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
}

interface DragState {
  pointerId: number;
  corner: CropCorner;
  clientX: number;
  clientY: number;
  crop: CropRect;
  frameWidth: number;
  frameHeight: number;
  sourceUrl: string;
  viewResetKey: number;
}

interface CropLoupeState {
  corner: CropCorner;
  frameWidth: number;
  frameHeight: number;
  viewport?: CropPreviewLayout;
}

interface ViewIdentity {
  sourceUrl: string;
  viewResetKey: number;
}

interface ProjectedPreviewGeometry {
  sourceWidth: number;
  sourceHeight: number;
  bounds: ReturnType<typeof getProjectedImageGeometry>;
}

const FULL_IMAGE: CropRect = { x: 0, y: 0, width: 1, height: 1 };

const CORNERS: readonly CropCorner[] = [
  "north-west",
  "north-east",
  "south-west",
  "south-east",
];

export function ImageCropper({
  sourceUrl,
  crop,
  onCropChange,
  imageAlt,
  cornerLabel,
  compact = false,
  className,
  imageClassName,
  tiltDegrees = 0,
  rotationX = 0,
  rotationY = 0,
  fixedFrame = false,
  zoomOutLabel = "Show entire photo",
  showZoomOut = true,
  viewResetKey = 0,
  fullViewport = false,
  viewportInsets,
}: ImageCropperProps) {
  const imageFrameRef = useRef<HTMLDivElement>(null);
  const { availableRef, availableSpace } = useAvailableCropSpace();
  const dragRef = useRef<DragState | undefined>(undefined);
  const [loupe, setLoupe] = useState<CropLoupeState>();
  const keyboardResizeRef = useRef(false);
  const [focusedView, setFocusedView] = useState<ViewIdentity>();
  const [fullImageView, setFullImageView] = useState<ViewIdentity>();
  const [frozenView, setFrozenView] = useState<
    ViewIdentity & { layout: CropPreviewLayout }
  >();
  const [animatedView, setAnimatedView] = useState<
    ViewIdentity & { tiltDegrees: number; rotationX: number; rotationY: number }
  >();
  const [naturalSize, setNaturalSize] = useState<{
    sourceUrl: string;
    width: number;
    height: number;
  }>();
  const geometry: ProjectedPreviewGeometry | undefined =
    naturalSize?.sourceUrl === sourceUrl
      ? {
          sourceWidth: naturalSize.width,
          sourceHeight: naturalSize.height,
          bounds: getProjectedImageGeometry(
            naturalSize.width,
            naturalSize.height,
            { tiltDegrees, rotationX, rotationY, fixedFrame },
          ),
        }
      : undefined;
  const isCurrentView = (view: ViewIdentity | undefined) =>
    view?.sourceUrl === sourceUrl && view.viewResetKey === viewResetKey;
  const focused =
    isCurrentView(focusedView) ||
    (fullViewport && !isCurrentView(fullImageView));
  const frozen = isCurrentView(frozenView) ? frozenView : undefined;
  const fullPreview = geometry
    ? fitCropPreview({
        viewportWidth: availableSpace.width,
        viewportHeight: availableSpace.height,
        imageWidth: geometry.bounds.width,
        imageHeight: geometry.bounds.height,
        crop: FULL_IMAGE,
        padding: fullViewport ? spacing[3] : spacing[8],
        insets: viewportInsets,
      })
    : null;
  const desiredPreview =
    focused && geometry
      ? fitCropPreview({
          viewportWidth: availableSpace.width,
          viewportHeight: availableSpace.height,
          imageWidth: geometry.bounds.width,
          imageHeight: geometry.bounds.height,
          crop,
          padding: fullViewport ? spacing[3] : spacing[8],
          insets: viewportInsets,
        })
      : fullPreview;
  const preview = frozen?.layout ?? desiredPreview;
  const animate =
    !frozen &&
    isCurrentView(animatedView) &&
    animatedView?.tiltDegrees === tiltDegrees &&
    animatedView.rotationX === rotationX &&
    animatedView.rotationY === rotationY;
  const correcting = tiltDegrees !== 0 || rotationX !== 0 || rotationY !== 0;
  const zoomed =
    focused &&
    desiredPreview &&
    fullPreview &&
    desiredPreview.width > fullPreview.width;
  const sideSpace = desiredPreview
    ? (availableSpace.width - crop.width * desiredPreview.width) / 2
    : 0;
  const zoomOutPosition =
    sideSpace >= spacing[12] + spacing[6] + spacing[2]
      ? {
          left: (sideSpace - spacing[6] - spacing[12]) / 2,
          top: Math.max(0, (availableSpace.height - spacing[12]) / 2),
        }
      : {
          left: (availableSpace.width - spacing[12]) / 2,
          top: fullViewport ? (viewportInsets?.top ?? 0) : -spacing[3],
        };

  function freezePreview() {
    const frame = imageFrameRef.current?.getBoundingClientRect();
    const viewport = availableRef.current?.getBoundingClientRect();
    if (preview && frame && viewport && frame.width > 0 && frame.height > 0) {
      setFrozenView({
        sourceUrl,
        viewResetKey,
        layout: {
          left: frame.left - viewport.left,
          top: frame.top - viewport.top,
          width: frame.width,
          height: frame.height,
        },
      });
    }
    return { frame, viewport };
  }

  function fitSelection() {
    setFrozenView(undefined);
    setFocusedView({ sourceUrl, viewResetKey });
    setAnimatedView({
      sourceUrl,
      viewResetKey,
      tiltDegrees,
      rotationX,
      rotationY,
    });
  }

  function beginResize(
    corner: CropCorner,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const { frame, viewport } = freezePreview();
    dragRef.current = {
      pointerId: event.pointerId,
      corner,
      clientX: event.clientX,
      clientY: event.clientY,
      crop,
      frameWidth: frame?.width ?? 0,
      frameHeight: frame?.height ?? 0,
      sourceUrl,
      viewResetKey,
    };
    setLoupe(
      frame && frame.width > 0 && frame.height > 0
        ? {
            corner,
            frameWidth: frame.width,
            frameHeight: frame.height,
            viewport:
              viewport && viewport.width > 0 && viewport.height > 0
                ? {
                    left: viewport.left - frame.left,
                    top: viewport.top - frame.top,
                    width: viewport.width,
                    height: viewport.height,
                  }
                : undefined,
          }
        : undefined,
    );
  }

  function resize(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !isCurrentView(drag))
      return;
    const delta = previewDeltaToCropDelta(
      event.clientX - drag.clientX,
      event.clientY - drag.clientY,
      { width: drag.frameWidth, height: drag.frameHeight },
    );
    if (!delta) return;
    onCropChange(resizeCropRect(drag.crop, drag.corner, delta.x, delta.y));
  }

  function endResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = undefined;
      setLoupe(undefined);
      fitSelection();
    }
  }

  const selectionStyle = percentRect(crop);

  return (
    <div
      className={cn(
        fullViewport
          ? "absolute inset-0 overflow-hidden"
          : "flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-3",
        className,
      )}
    >
      <div
        ref={availableRef}
        data-slot="crop-available-space"
        className={cn(
          "relative flex h-full w-full min-h-0 items-center justify-center",
          fullViewport
            ? "absolute inset-0"
            : compact
              ? "max-h-[calc(100dvh-var(--spacing-64))] max-w-full"
              : "max-h-[calc(100dvh-var(--spacing-32))] max-w-[calc(100vw-var(--spacing-8))]",
          imageClassName,
        )}
      >
        <div
          className={preview ? "absolute inset-0 overflow-hidden" : "contents"}
        >
          <div
            ref={imageFrameRef}
            data-slot="receipt-crop-frame"
            className={cn(
              "inline-flex shrink-0 touch-none bg-background",
              preview ? "absolute" : "relative max-h-full max-w-full",
              animate
                ? "transition-[left,top,width,height] duration-normal ease-decelerate motion-reduce:transition-none"
                : "transition-none",
            )}
            onTransitionEnd={() => setAnimatedView(undefined)}
            style={
              geometry
                ? {
                    ...(preview ?? {
                      width: geometry.bounds.width,
                      height: geometry.bounds.height,
                    }),
                  }
                : undefined
            }
          >
            <div
              data-slot={geometry ? "crop-projected-surface" : undefined}
              className={
                geometry
                  ? cn(
                      "absolute top-0 left-0",
                      animate
                        ? "transition-transform duration-normal ease-decelerate motion-reduce:transition-none"
                        : "transition-none",
                    )
                  : "contents"
              }
              style={
                geometry
                  ? projectedSurfaceStyle(
                      geometry,
                      preview ? preview.width / geometry.bounds.width : 1,
                    )
                  : undefined
              }
            >
              <img
                data-slot={
                  geometry ? "crop-transformed-image" : "crop-source-image"
                }
                src={sourceUrl}
                alt={imageAlt}
                draggable={false}
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (!naturalWidth || !naturalHeight) return;
                  setNaturalSize({
                    sourceUrl,
                    width: naturalWidth,
                    height: naturalHeight,
                  });
                }}
                className={
                  geometry
                    ? "pointer-events-none absolute top-0 left-0 block max-w-none select-none"
                    : "block max-h-full max-w-full object-contain select-none"
                }
                style={geometry ? transformedImageStyle(geometry) : undefined}
              />
            </div>

            <CropScrim crop={crop} expanded={fullViewport} />
            <div
              className="pointer-events-none absolute border-2 border-foreground"
              style={selectionStyle}
              aria-hidden="true"
            />
            {correcting ? (
              <div
                data-slot="crop-alignment-grid"
                className="pointer-events-none absolute"
                style={selectionStyle}
                aria-hidden="true"
              >
                <span className="absolute inset-y-0 left-1/3 w-0.5 border-r border-background/40 bg-foreground/60" />
                <span className="absolute inset-y-0 left-2/3 w-0.5 border-r border-background/40 bg-foreground/60" />
                <span className="absolute inset-x-0 top-1/3 h-0.5 border-b border-background/40 bg-foreground/60" />
                <span className="absolute inset-x-0 top-2/3 h-0.5 border-b border-background/40 bg-foreground/60" />
              </div>
            ) : null}

            {CORNERS.map((corner) => (
              <button
                key={corner}
                type="button"
                aria-label={cornerLabel(corner)}
                className={`group absolute flex size-12 touch-none items-center justify-center rounded-full outline-none ${cornerPosition(
                  corner,
                )}`}
                style={cornerStyle(crop, corner)}
                onKeyDown={(event) => {
                  const direction = {
                    ArrowLeft: [-0.01, 0],
                    ArrowRight: [0.01, 0],
                    ArrowUp: [0, -0.01],
                    ArrowDown: [0, 0.01],
                  }[event.key];
                  if (!direction) return;
                  event.preventDefault();
                  if (!keyboardResizeRef.current) {
                    keyboardResizeRef.current = true;
                    freezePreview();
                  }
                  onCropChange(
                    resizeCropRect(crop, corner, direction[0]!, direction[1]!),
                  );
                }}
                onKeyUp={(event) => {
                  if (
                    keyboardResizeRef.current &&
                    [
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                    ].includes(event.key)
                  ) {
                    keyboardResizeRef.current = false;
                    fitSelection();
                  }
                }}
                onBlur={() => {
                  if (keyboardResizeRef.current) {
                    keyboardResizeRef.current = false;
                    fitSelection();
                  }
                }}
                onPointerDown={(event) => beginResize(corner, event)}
                onPointerMove={resize}
                onPointerUp={endResize}
                onPointerCancel={endResize}
                onLostPointerCapture={endResize}
              >
                <span
                  aria-hidden="true"
                  className="size-6 rounded-full border-2 border-foreground bg-background text-foreground shadow-sm group-focus-visible:ring-2 group-focus-visible:ring-foreground"
                />
              </button>
            ))}

            {loupe ? (
              <CropCornerLoupe
                sourceUrl={sourceUrl}
                crop={crop}
                state={loupe}
                geometry={correcting ? geometry : undefined}
              />
            ) : null}
          </div>
        </div>
        {showZoomOut && zoomed && !frozen ? (
          <button
            type="button"
            aria-label={zoomOutLabel}
            className="absolute z-raised flex size-12 items-center justify-center rounded-full border border-border bg-background text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground"
            style={zoomOutPosition}
            onClick={() => {
              setFocusedView(undefined);
              setFullImageView({ sourceUrl, viewResetKey });
              setAnimatedView({
                sourceUrl,
                viewResetKey,
                tiltDegrees,
                rotationX,
                rotationY,
              });
            }}
          >
            <ZoomOutIcon className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TransformedImage({
  sourceUrl,
  imageAlt,
  geometry,
  scale,
}: {
  sourceUrl: string;
  imageAlt: string;
  geometry: ProjectedPreviewGeometry;
  scale: number;
}) {
  return (
    <div
      className="absolute top-0 left-0"
      style={projectedSurfaceStyle(geometry, scale)}
    >
      <img
        data-slot="crop-transformed-image"
        src={sourceUrl}
        alt={imageAlt}
        draggable={false}
        className="pointer-events-none absolute top-0 left-0 block max-w-none select-none"
        style={transformedImageStyle(geometry)}
      />
    </div>
  );
}

function transformedImageStyle({
  sourceWidth,
  sourceHeight,
  bounds,
}: ProjectedPreviewGeometry) {
  return {
    width: sourceWidth,
    height: sourceHeight,
    transformOrigin: "0 0",
    transform: `matrix3d(${bounds.matrix3d.join(", ")})`,
  };
}

function projectedSurfaceStyle(
  geometry: ProjectedPreviewGeometry,
  scale: number,
) {
  return {
    width: geometry.bounds.width,
    height: geometry.bounds.height,
    transformOrigin: "0 0",
    transform: `scale(${scale})`,
  };
}

function useAvailableCropSpace() {
  const availableRef = useRef<HTMLDivElement>(null);
  const [availableSpace, setAvailableSpace] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const container = availableRef.current;
    if (!container) return;
    const measure = () => {
      const { width, height } = container.getBoundingClientRect();
      setAvailableSpace((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return { availableRef, availableSpace };
}

function CropCornerLoupe({
  sourceUrl,
  crop,
  state,
  geometry,
}: {
  sourceUrl: string;
  crop: CropRect;
  state: CropLoupeState;
  geometry?: ProjectedPreviewGeometry;
}) {
  const point = cropCornerPoint(crop, state.corner);
  const scaledWidth = state.frameWidth * magnification.loupe;
  const scaledHeight = state.frameHeight * magnification.loupe;
  const horizontalOffset = state.corner.endsWith("west") ? "+" : "-";
  const verticalOffset = state.corner.startsWith("north") ? "+" : "-";

  return (
    <div
      data-slot="crop-corner-preview"
      aria-hidden="true"
      className="pointer-events-none absolute z-raised size-24 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 border-foreground bg-background bg-no-repeat shadow-sm"
      style={{
        left: state.viewport
          ? loupeCoordinate(
              point.x * state.frameWidth,
              horizontalOffset === "+" ? spacing[18] : -spacing[18],
              state.viewport.left,
              state.viewport.width,
            )
          : `clamp(var(--spacing-12), calc(${point.x * 100}% ${horizontalOffset} var(--spacing-18)), calc(100% - var(--spacing-12)))`,
        top: state.viewport
          ? loupeCoordinate(
              point.y * state.frameHeight,
              verticalOffset === "+" ? spacing[18] : -spacing[18],
              state.viewport.top,
              state.viewport.height,
            )
          : `clamp(var(--spacing-12), calc(${point.y * 100}% ${verticalOffset} var(--spacing-18)), calc(100% - var(--spacing-12)))`,
        ...(geometry
          ? {}
          : {
              backgroundImage: `url(${JSON.stringify(sourceUrl)})`,
              backgroundSize: `${scaledWidth}px ${scaledHeight}px`,
              backgroundPosition: `${Math.round(spacing[12] - point.x * scaledWidth)}px ${Math.round(spacing[12] - point.y * scaledHeight)}px`,
            }),
      }}
    >
      {geometry ? (
        <div
          data-slot="crop-loupe-transformed-surface"
          className="absolute bg-background"
          style={{
            width: scaledWidth,
            height: scaledHeight,
            left: spacing[12] - point.x * scaledWidth,
            top: spacing[12] - point.y * scaledHeight,
          }}
        >
          <TransformedImage
            sourceUrl={sourceUrl}
            imageAlt=""
            geometry={geometry}
            scale={scaledWidth / geometry.bounds.width}
          />
        </div>
      ) : null}
      <span
        data-slot="crop-loupe-crosshair-outline"
        className="absolute top-1/2 left-1/2 h-1 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background"
      />
      <span className="absolute top-1/2 left-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background" />
      <span className="absolute top-1/2 left-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 bg-foreground" />
      <span className="absolute top-1/2 left-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground" />
    </div>
  );
}

function loupeCoordinate(
  point: number,
  offset: number,
  viewportStart: number,
  viewportSize: number,
) {
  if (viewportSize <= spacing[24]) return viewportStart + viewportSize / 2;
  return Math.max(
    viewportStart + spacing[12],
    Math.min(viewportStart + viewportSize - spacing[12], point + offset),
  );
}

function CropScrim({
  crop,
  expanded = false,
}: {
  crop: CropRect;
  expanded?: boolean;
}) {
  const right = crop.x + crop.width;
  const bottom = crop.y + crop.height;

  return (
    <div
      data-slot="crop-outside-mask"
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
    >
      <div
        className="absolute inset-x-0 top-0 bg-background/60"
        style={
          expanded
            ? {
                top: "auto",
                left: "-100vw",
                right: "-100vw",
                bottom: `${(1 - crop.y) * 100}%`,
                height: "100dvh",
              }
            : { height: `${crop.y * 100}%` }
        }
      />
      <div
        className="absolute inset-x-0 bottom-0 bg-background/60"
        style={
          expanded
            ? {
                bottom: "auto",
                left: "-100vw",
                right: "-100vw",
                top: `${bottom * 100}%`,
                height: "100dvh",
              }
            : { height: `${(1 - bottom) * 100}%` }
        }
      />
      <div
        className="absolute left-0 bg-background/60"
        style={{
          top: `${crop.y * 100}%`,
          width: `${crop.x * 100}%`,
          height: `${crop.height * 100}%`,
          ...(expanded
            ? { left: "auto", right: `${(1 - crop.x) * 100}%`, width: "100vw" }
            : {}),
        }}
      />
      <div
        className="absolute right-0 bg-background/60"
        style={{
          top: `${crop.y * 100}%`,
          width: `${(1 - right) * 100}%`,
          height: `${crop.height * 100}%`,
          ...(expanded
            ? { right: "auto", left: `${right * 100}%`, width: "100vw" }
            : {}),
        }}
      />
    </div>
  );
}

function percentRect(crop: CropRect) {
  return {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  };
}

function cornerStyle(crop: CropRect, corner: CropCorner) {
  return {
    left: `${(corner.endsWith("west") ? crop.x : crop.x + crop.width) * 100}%`,
    top: `${
      (corner.startsWith("north") ? crop.y : crop.y + crop.height) * 100
    }%`,
  };
}

function cropCornerPoint(crop: CropRect, corner: CropCorner) {
  return {
    x: corner.endsWith("west") ? crop.x : crop.x + crop.width,
    y: corner.startsWith("north") ? crop.y : crop.y + crop.height,
  };
}

function cornerPosition(corner: CropCorner): string {
  if (corner === "north-west") return "-translate-x-1/2 -translate-y-1/2";
  if (corner === "north-east") return "-translate-x-1/2 -translate-y-1/2";
  if (corner === "south-west") return "-translate-x-1/2 -translate-y-1/2";
  return "-translate-x-1/2 -translate-y-1/2";
}
