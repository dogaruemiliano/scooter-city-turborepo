"use client";

import { magnification, spacing } from "@repo/theme";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef, useState } from "react";

import {
  resizeCropRect,
  type CropCorner,
  type CropRect,
} from "@/lib/crop-image";

interface ImageCropperProps {
  sourceUrl: string;
  crop: CropRect;
  onCropChange: (crop: CropRect) => void;
  imageAlt: string;
  cornerLabel: (corner: CropCorner) => string;
  compact?: boolean;
}

interface DragState {
  pointerId: number;
  corner: CropCorner;
  clientX: number;
  clientY: number;
  crop: CropRect;
}

interface CropLoupeState {
  corner: CropCorner;
  frameWidth: number;
  frameHeight: number;
}

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
}: ImageCropperProps) {
  const imageFrameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | undefined>(undefined);
  const [loupe, setLoupe] = useState<CropLoupeState>();

  function beginResize(
    corner: CropCorner,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      corner,
      clientX: event.clientX,
      clientY: event.clientY,
      crop,
    };

    const frame = imageFrameRef.current?.getBoundingClientRect();
    setLoupe(
      frame && frame.width > 0 && frame.height > 0
        ? {
            corner,
            frameWidth: frame.width,
            frameHeight: frame.height,
          }
        : undefined,
    );
  }

  function resize(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    const frame = imageFrameRef.current?.getBoundingClientRect();
    if (
      !drag ||
      !frame ||
      frame.width <= 0 ||
      frame.height <= 0 ||
      drag.pointerId !== event.pointerId
    ) {
      return;
    }

    onCropChange(
      resizeCropRect(
        drag.crop,
        drag.corner,
        (event.clientX - drag.clientX) / frame.width,
        (event.clientY - drag.clientY) / frame.height,
      ),
    );
  }

  function endResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = undefined;
      setLoupe(undefined);
    }
  }

  const selectionStyle = percentRect(crop);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-3">
      <div
        ref={imageFrameRef}
        data-slot="receipt-crop-frame"
        className="relative inline-flex max-h-full max-w-full touch-none overflow-hidden"
      >
        {/* A blob URL has no stable dimensions for next/image optimization. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sourceUrl}
          alt={imageAlt}
          draggable={false}
          className={
            compact
              ? "block max-h-[calc(100dvh-var(--spacing-64))] max-w-full object-contain select-none"
              : "block max-h-[calc(100dvh-var(--spacing-32))] max-w-[calc(100vw-var(--spacing-8))] object-contain select-none"
          }
        />

        <CropScrim crop={crop} />
        <div
          className="pointer-events-none absolute border-2 border-mist-50"
          style={selectionStyle}
          aria-hidden="true"
        />

        {CORNERS.map((corner) => (
          <button
            key={corner}
            type="button"
            aria-label={cornerLabel(corner)}
            className={`absolute size-6 touch-none rounded-full border-2 border-mist-950 bg-mist-50 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-mist-50 ${cornerPosition(
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
              onCropChange(
                resizeCropRect(crop, corner, direction[0]!, direction[1]!),
              );
            }}
            onPointerDown={(event) => beginResize(corner, event)}
            onPointerMove={resize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            onLostPointerCapture={endResize}
          />
        ))}

        {loupe ? (
          <CropCornerLoupe sourceUrl={sourceUrl} crop={crop} state={loupe} />
        ) : null}
      </div>
    </div>
  );
}

function CropCornerLoupe({
  sourceUrl,
  crop,
  state,
}: {
  sourceUrl: string;
  crop: CropRect;
  state: CropLoupeState;
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
      className="pointer-events-none absolute z-raised size-24 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 border-mist-50 bg-mist-950 bg-no-repeat shadow-sm"
      style={{
        left: `clamp(var(--spacing-12), calc(${point.x * 100}% ${horizontalOffset} var(--spacing-18)), calc(100% - var(--spacing-12)))`,
        top: `clamp(var(--spacing-12), calc(${point.y * 100}% ${verticalOffset} var(--spacing-18)), calc(100% - var(--spacing-12)))`,
        backgroundImage: `url(${JSON.stringify(sourceUrl)})`,
        backgroundSize: `${scaledWidth}px ${scaledHeight}px`,
        backgroundPosition: `${Math.round(spacing[12] - point.x * scaledWidth)}px ${Math.round(spacing[12] - point.y * scaledHeight)}px`,
      }}
    >
      <span
        data-slot="crop-loupe-crosshair-outline"
        className="absolute top-1/2 left-1/2 h-1 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mist-950"
      />
      <span className="absolute top-1/2 left-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mist-950" />
      <span className="absolute top-1/2 left-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 bg-mist-50" />
      <span className="absolute top-1/2 left-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-mist-50" />
    </div>
  );
}

function CropScrim({ crop }: { crop: CropRect }) {
  const right = crop.x + crop.width;
  const bottom = crop.y + crop.height;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div
        className="absolute inset-x-0 top-0 bg-mist-1000/60"
        style={{ height: `${crop.y * 100}%` }}
      />
      <div
        className="absolute inset-x-0 bottom-0 bg-mist-1000/60"
        style={{ height: `${(1 - bottom) * 100}%` }}
      />
      <div
        className="absolute left-0 bg-mist-1000/60"
        style={{
          top: `${crop.y * 100}%`,
          width: `${crop.x * 100}%`,
          height: `${crop.height * 100}%`,
        }}
      />
      <div
        className="absolute right-0 bg-mist-1000/60"
        style={{
          top: `${crop.y * 100}%`,
          width: `${(1 - right) * 100}%`,
          height: `${crop.height * 100}%`,
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
