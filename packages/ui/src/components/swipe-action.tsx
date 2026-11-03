"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion } from "@repo/theme";

/** Leftward touch/pen gesture. The caller supplies a visible keyboard alternative. */
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
  } | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
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
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          axis: null,
          offset: 0,
        };
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
        )
          drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (drag.axis !== "x") return;
        event.preventDefault();
        suppressClick.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.offset = Math.max(
          -motion.gesture.swipeAction.maxTravel,
          Math.min(0, dx),
        );
        setOffset(drag.offset);
      }}
      onPointerUp={(event) => {
        const drag = gesture.current;
        gesture.current = null;
        setOffset(0);
        if (
          !disabled &&
          drag?.id === event.pointerId &&
          drag.axis === "x" &&
          -drag.offset >= motion.gesture.swipeAction.threshold
        )
          onAction();
      }}
      onPointerCancel={() => {
        gesture.current = null;
        setOffset(0);
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-success-subtle text-success"
      >
        {action}
      </div>
      <div
        className="relative transition-transform duration-fast motion-reduce:transition-none"
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
