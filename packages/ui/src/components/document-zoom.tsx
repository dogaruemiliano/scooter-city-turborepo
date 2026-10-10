"use client";

import { magnification } from "@repo/theme";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";

export type DocumentZoomLabels = {
  zoomIn: string;
  zoomOut: string;
  resetZoom: string;
};

/** Pinch, drag and keyboard-accessible zoom shared by images and PDF pages. */
export function DocumentZoom({
  children,
  labels,
  navigation,
  resetKey,
}: {
  children: (scale: number) => ReactNode;
  labels: DocumentZoomLabels;
  navigation?: ReactNode;
  resetKey?: number;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const currentView = useRef(view);
  useEffect(() => {
    currentView.current = { scale: 1, x: 0, y: 0 };
    setView(currentView.current);
    pointers.current.clear();
  }, [resetKey]);
  function update(
    scale: number,
    x = currentView.current.x,
    y = currentView.current.y,
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
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="document-zoom">
      <div
        ref={viewport}
        data-slot="document-zoom-viewport"
        data-zoom={view.scale}
        className="relative min-h-0 flex-1 touch-none overflow-hidden overscroll-none"
        onDoubleClick={() =>
          update(view.scale > 1 ? 1 : magnification.loupe, 0, 0)
        }
        onPointerDown={(event) => {
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const before = pointers.current.get(event.pointerId);
          if (!before) return;
          const oldPoints = [...pointers.current.values()];
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
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
        onPointerUp={(event) => pointers.current.delete(event.pointerId)}
        onPointerCancel={(event) => pointers.current.delete(event.pointerId)}
        onLostPointerCapture={(event) =>
          pointers.current.delete(event.pointerId)
        }
      >
        <div
          className="absolute inset-0 flex min-h-0 flex-col"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          {children(view.scale)}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-1 bg-popover text-popover-foreground">
        {navigation}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={labels.zoomOut}
          disabled={view.scale <= 1}
          onClick={() => update(view.scale - magnification.documentStep)}
        >
          <MinusIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="text"
          aria-label={labels.resetZoom}
          onClick={() => update(1, 0, 0)}
          className="tabular-nums"
        >
          {Math.round(view.scale * 100)}%
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={labels.zoomIn}
          disabled={view.scale >= magnification.documentMax}
          onClick={() => update(view.scale + magnification.documentStep)}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
