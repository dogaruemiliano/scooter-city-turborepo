"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion, spacing } from "@repo/theme";
import { cn } from "@repo/ui/lib/utils";

/** Leftward touch/pen gesture. Keep the action available through the child's keyboard-accessible detail flow. */
export function SwipeAction({
  children,
  action,
  onAction,
  disabled = false,
}: {
  children: ReactNode;
  action: ReactNode;
  onAction: () => void;
  disabled?: boolean;
}) {
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    axis: "x" | "y" | null;
    offset: number;
    startOffset: number;
  } | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const [{ offset, dragging }, setPosition] = useState({
    offset: 0,
    dragging: false,
  });
  const revealWidth = Math.max(0, -offset - spacing[2]);
  const settle = () => {
    gesture.current = null;
    setPosition({ offset: 0, dragging: false });
  };
  return (
    <div
      data-slot="swipe-action"
      className="relative isolate overflow-hidden rounded-xl"
      style={{ touchAction: "pan-y pinch-zoom" }}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      }}
      onPointerDown={(event) => {
        suppressClick.current = false;
        if (
          disabled ||
          event.pointerType === "mouse" ||
          !event.isPrimary ||
          (event.target as HTMLElement).closest(
            "button, input, textarea, select, [contenteditable=true]",
          )
        )
          return;
        // Preserve the current visual position if a new swipe interrupts the return.
        const startOffset = Math.max(
          -motion.gesture.swipeAction.maxTravel,
          Math.min(
            0,
            (content.current?.getBoundingClientRect().left ??
              event.currentTarget.getBoundingClientRect().left) -
              event.currentTarget.getBoundingClientRect().left,
          ),
        );
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          axis: null,
          offset: startOffset,
          startOffset,
        };
        setPosition({ offset: startOffset, dragging: true });
      }}
      onPointerMove={(event) => {
        const drag = gesture.current;
        if (!drag || drag.id !== event.pointerId || disabled) return;
        const dx = event.clientX - drag.x,
          dy = event.clientY - drag.y;
        if (
          !drag.axis &&
          Math.max(Math.abs(dx), Math.abs(dy)) >=
            motion.gesture.swipeAction.axisLockDistance
        ) {
          drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          if (drag.axis === "x")
            event.currentTarget.setPointerCapture?.(event.pointerId);
          else setPosition({ offset: 0, dragging: false });
        }
        if (drag.axis !== "x") return;
        event.preventDefault();
        suppressClick.current = true;
        drag.offset = Math.max(
          -motion.gesture.swipeAction.maxTravel,
          Math.min(0, drag.startOffset + dx),
        );
        setPosition({ offset: drag.offset, dragging: true });
      }}
      onPointerUp={(event) => {
        const drag = gesture.current;
        if (!drag || drag.id !== event.pointerId) return;
        settle();
        if (
          !disabled &&
          drag?.id === event.pointerId &&
          drag.axis === "x" &&
          -drag.offset >= motion.gesture.swipeAction.threshold
        )
          onAction();
      }}
      onPointerCancel={(event) => {
        if (gesture.current?.id === event.pointerId) settle();
      }}
      onLostPointerCapture={(event) => {
        // Ignore capture transferred from a nested link to this wrapper.
        if (
          event.target === event.currentTarget &&
          gesture.current?.id === event.pointerId
        )
          settle();
      }}
    >
      <div
        aria-hidden="true"
        data-slot="swipe-action-surface"
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 flex items-center justify-center overflow-hidden rounded-2xl bg-success-subtle text-success",
          !dragging &&
            "transition-[width] duration-fast ease-decelerate motion-reduce:transition-none",
        )}
        style={{ width: revealWidth }}
      >
        <span className="flex shrink-0 items-center justify-center">
          {action}
        </span>
      </div>
      <div
        ref={content}
        data-slot="swipe-action-content"
        data-dragging={dragging || undefined}
        className={cn(
          "relative",
          !dragging &&
            "transition-transform duration-fast ease-decelerate motion-reduce:transition-none",
        )}
        style={{ transform: `translate3d(${offset}px, 0, 0)` }}
      >
        {children}
      </div>
    </div>
  );
}
