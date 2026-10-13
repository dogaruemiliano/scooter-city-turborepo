"use client";

import { magnification, motion, spacing } from "@repo/theme";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";
import {
  DocumentPreviewHeader,
  type DocumentPreviewHeaderProps,
} from "./document-preview-header";

export type DocumentZoomLabels = {
  zoomIn: string;
  zoomOut: string;
  resetZoom: string;
};

type DocumentPointer = {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startedAt: number;
  tap: boolean;
};

/** Pinch, drag and keyboard-accessible zoom shared by images and PDF pages. */
export function DocumentZoom({
  children,
  labels,
  navigation,
  resetKey,
  caption,
  onClosePress,
  closeLabel,
  headerActions,
}: {
  children: (scale: number) => ReactNode;
  labels: DocumentZoomLabels;
  navigation?: ReactNode;
  resetKey?: number;
} & DocumentPreviewHeaderProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, DocumentPointer>());
  const pointerSequence = useRef(0);
  const handledZoomSequence = useRef<number | null>(null);
  const lastTouchAt = useRef(-Infinity);
  const lastTap = useRef<{ x: number; y: number; timeStamp: number } | null>(
    null,
  );
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [animateZoom, setAnimateZoom] = useState(false);
  const currentView = useRef(view);
  useEffect(() => {
    currentView.current = { scale: 1, x: 0, y: 0 };
    setView(currentView.current);
    setAnimateZoom(false);
    pointers.current.clear();
    pointerSequence.current = 0;
    handledZoomSequence.current = null;
    lastTouchAt.current = -Infinity;
    lastTap.current = null;
  }, [resetKey]);
  function update(
    scale: number,
    x = currentView.current.x,
    y = currentView.current.y,
    animate = false,
  ) {
    const bounded = Math.max(1, Math.min(magnification.documentMax, scale));
    const width = viewport.current?.clientWidth ?? 0;
    const height = viewport.current?.clientHeight ?? 0;
    const maxX = (width * (bounded - 1)) / 2;
    const maxY = (height * (bounded - 1)) / 2;
    currentView.current = {
      scale: bounded,
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
    setView(currentView.current);
    setAnimateZoom(animate);
  }
  function toggleZoom(clientX: number, clientY: number) {
    // A pointer release and its native dblclick can describe the same gesture,
    // even when the native event arrives after the compatibility time window.
    // Another pointer press is required before that gesture can toggle again.
    if (handledZoomSequence.current === pointerSequence.current) return;
    handledZoomSequence.current = pointerSequence.current;
    const current = currentView.current;
    if (current.scale > 1) {
      update(1, 0, 0, true);
      return;
    }
    const bounds = viewport.current?.getBoundingClientRect();
    if (!bounds) return;
    const x = clientX - bounds.left - bounds.width / 2;
    const y = clientY - bounds.top - bounds.height / 2;
    const ratio = magnification.loupe / current.scale;
    // Preserve the document point under the pointer as scale changes.
    update(
      magnification.loupe,
      x - (x - current.x) * ratio,
      y - (y - current.y) * ratio,
      true,
    );
  }
  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
      data-slot="document-zoom"
    >
      <DocumentPreviewHeader
        caption={caption}
        onClosePress={onClosePress}
        closeLabel={closeLabel}
        headerActions={headerActions}
      />
      <div
        ref={viewport}
        data-slot="document-zoom-viewport"
        data-zoom={view.scale}
        className="relative min-h-0 flex-1 touch-none overflow-hidden overscroll-none"
        onDoubleClick={(event) => {
          // Touch is handled on pointer release. Compatibility mouse events
          // (including Firefox's touch emulation) must not toggle it again.
          if (
            event.timeStamp - lastTouchAt.current <=
            motion.duration.doubleTap
          )
            return;
          toggleZoom(event.clientX, event.clientY);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if (event.pointerType === "touch")
            lastTouchAt.current = event.timeStamp;
          else if (
            event.timeStamp - lastTouchAt.current <=
            motion.duration.doubleTap
          )
            return;
          pointerSequence.current += 1;
          const tap = pointers.current.size === 0;
          if (!tap) {
            lastTap.current = null;
            for (const pointer of pointers.current.values())
              pointer.tap = false;
          }
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
            startX: event.clientX,
            startY: event.clientY,
            startedAt: event.timeStamp,
            tap,
          });
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const before = pointers.current.get(event.pointerId);
          if (!before) return;
          if (event.pointerType === "touch")
            lastTouchAt.current = event.timeStamp;
          if (before.x === event.clientX && before.y === event.clientY) return;
          const oldPoints = [...pointers.current.values()];
          pointers.current.set(event.pointerId, {
            ...before,
            x: event.clientX,
            y: event.clientY,
            tap:
              before.tap &&
              Math.hypot(
                event.clientX - before.startX,
                event.clientY - before.startY,
              ) <= spacing[2],
          });
          const points = [...pointers.current.values()];
          if (points.length === 2 && oldPoints.length === 2) {
            const distance = Math.hypot(
              oldPoints[0]!.x - oldPoints[1]!.x,
              oldPoints[0]!.y - oldPoints[1]!.y,
            );
            const nextDistance = Math.hypot(
              points[0]!.x - points[1]!.x,
              points[0]!.y - points[1]!.y,
            );
            if (distance)
              update((currentView.current.scale * nextDistance) / distance);
          } else
            update(
              currentView.current.scale,
              currentView.current.x + event.clientX - before.x,
              currentView.current.y + event.clientY - before.y,
            );
        }}
        onPointerUp={(event) => {
          const pointer = pointers.current.get(event.pointerId);
          pointers.current.delete(event.pointerId);
          if (event.pointerType !== "touch") return;
          lastTouchAt.current = event.timeStamp;
          if (
            !pointer?.tap ||
            event.timeStamp - pointer.startedAt > motion.duration.doubleTap ||
            Math.hypot(
              event.clientX - pointer.startX,
              event.clientY - pointer.startY,
            ) > spacing[2]
          ) {
            lastTap.current = null;
            return;
          }
          const previous = lastTap.current;
          lastTap.current = null;
          if (
            previous &&
            event.timeStamp - previous.timeStamp <= motion.duration.doubleTap &&
            Math.hypot(
              event.clientX - previous.x,
              event.clientY - previous.y,
            ) <= spacing[6]
          ) {
            toggleZoom(event.clientX, event.clientY);
          } else {
            lastTap.current = {
              x: event.clientX,
              y: event.clientY,
              timeStamp: event.timeStamp,
            };
          }
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          lastTap.current = null;
        }}
        onLostPointerCapture={(event) =>
          pointers.current.delete(event.pointerId)
        }
      >
        <div
          className={`absolute inset-0 flex min-h-0 flex-col ${animateZoom ? "transition-transform duration-fast ease-decelerate motion-reduce:transition-none" : "transition-none"}`}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          {children(view.scale)}
        </div>
      </div>
      <div
        data-slot="document-zoom-controls"
        className="absolute bottom-3 left-1/2 z-raised flex w-max max-w-[calc(100%-var(--spacing-4))] -translate-x-1/2 flex-wrap items-center justify-center rounded-xl border border-document-overlay-border bg-document-overlay p-1 text-foreground shadow-md"
      >
        {navigation}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 min-h-11 hover:bg-document-overlay disabled:border-transparent disabled:bg-transparent"
          aria-label={labels.zoomOut}
          disabled={view.scale <= 1}
          onClick={() =>
            update(
              view.scale - magnification.documentStep,
              undefined,
              undefined,
              true,
            )
          }
        >
          <MinusIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="text"
          aria-label={labels.resetZoom}
          onClick={() => update(1, 0, 0, true)}
          className="min-h-11 min-w-11 px-1 text-xs tabular-nums"
        >
          {Math.round(view.scale * 100)}%
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 min-h-11 hover:bg-document-overlay disabled:border-transparent disabled:bg-transparent"
          aria-label={labels.zoomIn}
          disabled={view.scale >= magnification.documentMax}
          onClick={() =>
            update(
              view.scale + magnification.documentStep,
              undefined,
              undefined,
              true,
            )
          }
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
