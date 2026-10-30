"use client";

import { useEffect, useId, useRef, useState } from "react";
import { semanticColors, spacing } from "@repo/theme";
import { Button } from "./button";

type Point = { x: number; y: number };
type Stroke = Point[];

export interface SignatureCaptureProps {
  label: string;
  hint: string;
  clearLabel: string;
  disabled?: boolean;
  /** A fresh PNG is emitted after every completed stroke; clearing emits null. */
  onChange: (pngDataUrl: string | null) => void;
}

/** Pointer and keyboard drawing. Each instance owns its own signature evidence. */
export function SignatureCapture({
  label,
  hint,
  clearLabel,
  disabled,
  onChange,
}: SignatureCaptureProps) {
  const id = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const cursor = useRef<Point>({ x: 0.5, y: 0.5 });
  const [hasInk, setHasInk] = useState(false);

  function paint() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = getComputedStyle(canvas).color;
    context.lineWidth = spacing[0.5];
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of strokes.current) {
      if (!stroke.length) continue;
      context.beginPath();
      stroke.forEach((point, index) => {
        if (index === 0)
          context.moveTo(point.x * canvas.width, point.y * canvas.height);
        else context.lineTo(point.x * canvas.width, point.y * canvas.height);
      });
      context.stroke();
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      paint();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  function finish() {
    if (!current.current) return;
    if (current.current.length < 2) strokes.current.pop();
    current.current = null;
    const ink = strokes.current.some((stroke) => stroke.length > 1);
    setHasInk(ink);
    paint();
    onChange(ink ? canvasRef.current!.toDataURL("image/png") : null);
  }
  function point(clientX: number, clientY: number): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }

  return (
    <div className="flex flex-col gap-2">
      <p
        id={`${id}-label`}
        className="text-sm font-medium text-muted-foreground"
      >
        {label}
      </p>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {hint}
      </p>
      <canvas
        ref={canvasRef}
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        aria-disabled={disabled || undefined}
        style={{
          backgroundColor: semanticColors.light.card,
          color: semanticColors.light.foreground,
        }}
        className="h-48 w-full touch-none rounded-lg border border-input bg-card text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const stroke = [point(event.clientX, event.clientY)];
          strokes.current.push(stroke);
          current.current = stroke;
        }}
        onPointerMove={(event) => {
          if (disabled || !current.current) return;
          current.current.push(point(event.clientX, event.clientY));
          paint();
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === " ") {
            event.preventDefault();
            if (current.current) finish();
            else {
              const stroke = [{ ...cursor.current }];
              strokes.current.push(stroke);
              current.current = stroke;
            }
          } else if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
              event.key,
            )
          ) {
            event.preventDefault();
            const step = 0.02;
            cursor.current = {
              x: Math.max(
                0,
                Math.min(
                  1,
                  cursor.current.x +
                    (event.key === "ArrowRight"
                      ? step
                      : event.key === "ArrowLeft"
                        ? -step
                        : 0),
                ),
              ),
              y: Math.max(
                0,
                Math.min(
                  1,
                  cursor.current.y +
                    (event.key === "ArrowDown"
                      ? step
                      : event.key === "ArrowUp"
                        ? -step
                        : 0),
                ),
              ),
            };
            if (current.current) {
              current.current.push({ ...cursor.current });
              paint();
            }
          } else if (event.key === "Escape") finish();
        }}
        onBlur={finish}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || !hasInk}
        onClick={() => {
          strokes.current = [];
          current.current = null;
          setHasInk(false);
          paint();
          onChange(null);
        }}
      >
        {clearLabel}
      </Button>
    </div>
  );
}
