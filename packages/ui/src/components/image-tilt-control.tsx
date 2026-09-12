"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { spacing } from "@repo/theme";
import { cn } from "@repo/ui/lib/utils";

interface ImageTiltControlProps {
  value: number;
  onValueChange: (value: number) => void;
  disabled?: boolean;
  label: string;
  min?: number;
  max?: number;
  overlay?: boolean;
}

const RULER_WIDTH = spacing[72];
const RULER_HEIGHT = spacing[12];
const VISIBLE_DEGREES = 30;

/** Pull the graduated ruler beneath the fixed pointer to adjust the active axis. */
export function ImageTiltControl({
  value,
  onValueChange,
  disabled = false,
  label,
  min = -15,
  max = 15,
  overlay = false,
}: ImageTiltControlProps) {
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startValue: number;
    width: number;
  } | null>(null);
  const normalize = (next: number) =>
    Math.round(
      Math.max(min, Math.min(max, Number.isFinite(next) ? next : 0)) * 10,
    ) / 10 || 0;
  const currentValue = normalize(value);
  const degrees = `${currentValue > 0 ? "+" : ""}${currentValue.toFixed(1)}°`;
  const firstTick = Math.ceil(
    Math.max(min, currentValue - VISIBLE_DEGREES / 2) * 2,
  );
  const lastTick = Math.floor(
    Math.min(max, currentValue + VISIBLE_DEGREES / 2) * 2,
  );

  function changeValue(next: number) {
    const normalized = normalize(next);
    if (!disabled && normalized !== currentValue) onValueChange(normalized);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0 || drag.current) return;
    const width = event.currentTarget.getBoundingClientRect().width;
    if (width <= 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: currentValue,
      width,
    };
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (disabled || !active || active.pointerId !== event.pointerId) return;
    changeValue(
      active.startValue -
        ((event.clientX - active.startX) / active.width) * VISIBLE_DEGREES,
    );
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const step = event.shiftKey ? 1 : 0.1;
    const next = {
      ArrowRight: currentValue + step,
      ArrowUp: currentValue + step,
      ArrowLeft: currentValue - step,
      ArrowDown: currentValue - step,
      PageUp: currentValue + 1,
      PageDown: currentValue - 1,
      Home: min,
      End: max,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    changeValue(next);
  }

  return (
    <div
      className={cn(
        "shrink-0 px-6 text-foreground",
        !overlay && "bg-background",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "mx-auto w-fit px-2 text-center text-sm tabular-nums",
          currentValue !== 0 && "text-primary",
        )}
      >
        {degrees}
      </div>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={currentValue}
        aria-valuetext={degrees}
        aria-orientation="horizontal"
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        className="mx-auto h-12 w-full max-w-96 touch-none cursor-ew-resize overflow-hidden rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-default aria-disabled:opacity-50"
      >
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox={`0 0 ${RULER_WIDTH} ${RULER_HEIGHT}`}
          preserveAspectRatio="none"
          className="pointer-events-none h-full w-full"
        >
          {Array.from(
            { length: Math.max(0, lastTick - firstTick + 1) },
            (_, index) => {
              const tick = (firstTick + index) / 2;
              const zero = tick === 0;
              const major = tick % 5 === 0;
              const length = zero
                ? spacing[8]
                : major
                  ? spacing[6]
                  : Number.isInteger(tick)
                    ? spacing[3]
                    : spacing[1.5];
              const x =
                RULER_WIDTH / 2 +
                ((tick - currentValue) / VISIBLE_DEGREES) * RULER_WIDTH;
              return (
                <line
                  key={tick}
                  data-slot="tilt-ruler-tick"
                  data-value={tick}
                  x1={x}
                  x2={x}
                  y1={(RULER_HEIGHT - length) / 2}
                  y2={(RULER_HEIGHT + length) / 2}
                  stroke="currentColor"
                  strokeWidth={zero ? spacing[0.5] : spacing.px}
                  vectorEffect="non-scaling-stroke"
                  className={
                    zero
                      ? "text-primary"
                      : major
                        ? "text-foreground/75"
                        : "text-foreground/35"
                  }
                />
              );
            },
          )}
          <line
            data-slot="tilt-ruler-pointer"
            x1={RULER_WIDTH / 2}
            x2={RULER_WIDTH / 2}
            y1={spacing[1]}
            y2={RULER_HEIGHT - spacing[1]}
            stroke="currentColor"
            strokeWidth={spacing[0.5]}
            vectorEffect="non-scaling-stroke"
            className="text-primary"
          />
        </svg>
      </div>
    </div>
  );
}
