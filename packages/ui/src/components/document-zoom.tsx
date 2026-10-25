"use client";

import { magnification, motion, spacing } from "@repo/theme";
import { MinusIcon, PlusIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
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

export type MediaNavigationProps = {
  onPrevious?: () => void;
  onNext?: () => void;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
  entryDirection?: -1 | 1;
};

type DocumentPointer = {
  axis?: "x" | "y";
  navigable: boolean;
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
  headerOverlay,
  bottomOverlay,
  onClosePress,
  closeLabel,
  headerActions,
  onPrevious,
  onNext,
  leftActions,
  rightActions,
  entryDirection,
  onSwipeDown,
  swipeDownTarget,
}: {
  bottomOverlay?: ReactNode;
  children: (scale: number) => ReactNode;
  labels: DocumentZoomLabels;
  navigation?: ReactNode;
  resetKey?: string | number;
  /** Opt-in dismissal; document review viewers remain locked. */
  onSwipeDown?: () => void;
  /** Move the complete viewer surface instead of the image when dismissing. */
  swipeDownTarget?: RefObject<HTMLElement | null>;
} & DocumentPreviewHeaderProps &
  MediaNavigationProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const slideAnimation = useRef<Animation | null>(null);
  const navigating = useRef(false);
  const dragOffset = useRef(0);
  const [slideOffset, setSlideOffset] = useState(0);
  const dragOffsetY = useRef(0);
  const [slideOffsetY, setSlideOffsetY] = useState(0);
  const resetSlide = useCallback(() => {
    dragOffset.current = 0;
    dragOffsetY.current = 0;
    setSlideOffset(0);
    setSlideOffsetY(0);
    if (swipeDownTarget?.current) swipeDownTarget.current.style.transform = "";
  }, [swipeDownTarget]);
  function snapBack() {
    if (dragOffset.current || dragOffsetY.current)
      slideTo(0, undefined, dragOffsetY.current ? "y" : "x");
  }
  const reducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function slideTo(offset: number, action?: () => void, axis: "x" | "y" = "x") {
    const node =
      axis === "y"
        ? (swipeDownTarget?.current ?? stage.current)
        : stage.current;
    if (!node || reducedMotion() || !node.animate) {
      resetSlide();
      action?.();
      return;
    }
    navigating.current = true;
    const animation = node.animate(
      [
        {
          transform: `translate${axis.toUpperCase()}(${axis === "x" ? dragOffset.current : dragOffsetY.current}px)`,
        },
        { transform: `translate${axis.toUpperCase()}(${offset}px)` },
      ],
      {
        duration: motion.duration.fast,
        easing: motion.easing.decelerate,
        fill: "forwards",
      },
    );
    slideAnimation.current = animation;
    void animation.finished
      .then(() => {
        // Hold the complete sheet offscreen through the dialog's exit lifecycle.
        if (axis === "y" && swipeDownTarget?.current && action) {
          navigating.current = false;
          action();
          return;
        }
        resetSlide();
        navigating.current = false;
        action?.();
        animation.cancel();
      })
      .catch(() => {});
  }
  useLayoutEffect(() => {
    resetSlide();
    navigating.current = false;
    slideAnimation.current?.cancel();
    const node = stage.current;
    if (entryDirection && node?.animate && !reducedMotion()) {
      slideAnimation.current = node.animate(
        [
          {
            transform: `translateX(${entryDirection * (viewport.current?.clientWidth ?? 0)}px)`,
          },
          { transform: "translateX(0px)" },
        ],
        { duration: motion.duration.fast, easing: motion.easing.decelerate },
      );
    }
    return () => {
      slideAnimation.current?.cancel();
    };
  }, [resetKey, entryDirection, resetSlide]);
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
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          (event.target as HTMLElement).closest(
            "input, textarea, select, [contenteditable=true], [role=slider], [role=menu], [role=listbox], [role=radio], [data-slot=media-left-actions], [data-slot=media-right-actions]",
          )
        )
          return;
        const action =
          event.key === "ArrowLeft"
            ? onPrevious
            : event.key === "ArrowRight"
              ? onNext
              : undefined;
        if (action) {
          event.preventDefault();
          action();
        }
      }}
      data-slot="document-zoom"
    >
      <DocumentPreviewHeader
        headerOverlay={headerOverlay}
        caption={caption}
        onClosePress={onClosePress}
        closeLabel={closeLabel}
        headerActions={headerActions}
      />
      {bottomOverlay ? (
        <div
          data-slot="document-preview-bottom"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-raised flex min-w-0 items-center justify-between gap-2 bg-linear-to-t from-media-scrim to-transparent px-3 pt-8 pb-[max(var(--spacing-3),env(safe-area-inset-bottom))] text-scrim-foreground *:pointer-events-auto"
        >
          {bottomOverlay}
        </div>
      ) : null}
      <div
        ref={viewport}
        data-slot="document-zoom-viewport"
        tabIndex={0}
        data-zoom={view.scale}
        className="relative min-h-0 flex-1 touch-none overflow-hidden overscroll-none select-none [-webkit-touch-callout:none]"
        onMouseDown={(event) => {
          if (event.detail > 1) event.preventDefault();
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
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
          if (event.button !== 0 || navigating.current) return;
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
            resetSlide();
            lastTap.current = null;
            for (const pointer of pointers.current.values()) {
              pointer.tap = false;
              pointer.navigable = false;
            }
          }
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
            startX: event.clientX,
            startY: event.clientY,
            startedAt: event.timeStamp,
            tap,
            navigable: tap && currentView.current.scale === 1,
          });
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const before = pointers.current.get(event.pointerId);
          if (!before) return;
          if (event.pointerType === "touch")
            lastTouchAt.current = event.timeStamp;
          if (before.x === event.clientX && before.y === event.clientY) return;
          if (
            before.navigable &&
            pointers.current.size === 1 &&
            currentView.current.scale === 1 &&
            (onPrevious || onNext || onSwipeDown)
          ) {
            const dx = event.clientX - before.startX;
            const dy = event.clientY - before.startY;
            if (
              !before.axis &&
              Math.max(Math.abs(dx), Math.abs(dy)) >= spacing[2]
            ) {
              before.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
              if (before.axis === "y" && onSwipeDown)
                swipeDownTarget?.current
                  ?.getAnimations?.()
                  .forEach((animation) => animation.cancel());
            }
            if (before.axis === "x") {
              const available = dx < 0 ? onNext : onPrevious;
              dragOffset.current = available
                ? dx
                : Math.sign(dx) * Math.min(Math.abs(dx), spacing[3]);
              setSlideOffset(dragOffset.current);
            } else if (before.axis === "y" && onSwipeDown) {
              dragOffsetY.current = Math.max(0, dy);
              if (swipeDownTarget?.current)
                swipeDownTarget.current.style.transform = dragOffsetY.current
                  ? `translateY(${dragOffsetY.current}px)`
                  : "";
              else setSlideOffsetY(dragOffsetY.current);
            }
          }
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
          if (
            pointer?.navigable &&
            currentView.current.scale === 1 &&
            pointers.current.size === 0
          ) {
            const dx = event.clientX - pointer.startX;
            const dy = event.clientY - pointer.startY;
            const axis =
              pointer.axis ?? (Math.abs(dx) > Math.abs(dy) ? "x" : "y");
            if (
              axis === "y" &&
              dy >= spacing[12] &&
              Math.abs(dy) > Math.abs(dx) &&
              onSwipeDown
            ) {
              lastTap.current = null;
              slideTo(
                swipeDownTarget?.current?.clientHeight ??
                  viewport.current?.clientHeight ??
                  0,
                onSwipeDown,
                "y",
              );
              return;
            }
            if (
              axis === "x" &&
              Math.abs(dx) >= spacing[12] &&
              Math.abs(dx) > Math.abs(dy)
            ) {
              lastTap.current = null;
              const action = dx < 0 ? onNext : onPrevious;
              slideTo(
                action
                  ? (dx < 0 ? -1 : 1) * (viewport.current?.clientWidth ?? 0)
                  : 0,
                action,
              );
              return;
            }
          }
          snapBack();
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
          snapBack();
        }}
        onLostPointerCapture={(event) => {
          if (pointers.current.delete(event.pointerId)) {
            lastTap.current = null;
            snapBack();
          }
        }}
      >
        <div
          ref={stage}
          data-slot="media-slide"
          className={`absolute inset-0 flex min-h-0 flex-col ${animateZoom ? "transition-transform duration-fast ease-decelerate motion-reduce:transition-none" : "transition-none"}`}
          style={{
            transform: `translate(${view.x + slideOffset}px, ${view.y + slideOffsetY}px) scale(${view.scale})`,
          }}
        >
          {children(view.scale)}
        </div>
      </div>
      {leftActions ? (
        <div
          data-slot="media-left-actions"
          className="absolute top-1/2 left-3 z-raised flex -translate-y-1/2 flex-col gap-2"
        >
          {leftActions}
        </div>
      ) : null}
      {rightActions ? (
        <div
          data-slot="media-right-actions"
          className="absolute top-1/2 right-3 z-raised flex -translate-y-1/2 flex-col gap-2"
        >
          {rightActions}
        </div>
      ) : null}
      <div
        data-slot="document-zoom-controls"
        className={`absolute ${bottomOverlay ? "bottom-24" : "bottom-3"} left-1/2 z-raised flex w-max max-w-[calc(100%-var(--spacing-4))] -translate-x-1/2 flex-wrap items-center justify-center rounded-xl border border-document-overlay-border bg-document-overlay p-1 text-foreground shadow-md`}
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
