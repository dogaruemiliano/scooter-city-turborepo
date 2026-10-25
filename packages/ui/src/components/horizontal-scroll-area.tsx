"use client";

import { useCallback, useEffect, useRef, type ComponentProps } from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { ChevronRight } from "lucide-react";
import { motion, spacing } from "@repo/theme";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

type HorizontalScrollAreaProps = Omit<
  ComponentProps<typeof ScrollAreaPrimitive.Root>,
  "className"
> & {
  className?: string;
  label: string;
  /** Fade only the edges with horizontally clipped content, using the shared tab fade width. */
  fadeEdges?: boolean;
  /** Keep touch scrolling, showing the scrollbar only at the lg breakpoint and above. */
  scrollbarVisibility?: "always" | "desktop";
  /** Enables a right-edge arrow and mouse-hover scrolling across the full viewport height. */
  scrollRightLabel?: string;
};

/** A native scrolling viewport with a persistent, draggable overflow indicator. */
export function HorizontalScrollArea({
  children,
  className,
  label,
  fadeEdges = false,
  scrollbarVisibility = "always",
  scrollRightLabel,
  onPointerMove,
  onPointerLeave,
  onPointerDown,
  ...props
}: HorizontalScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const previousTimeRef = useRef<number | null>(null);
  const stopScrolling = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    previousTimeRef.current = null;
  }, []);

  const startScrolling = useCallback(() => {
    if (frameRef.current !== null) return;
    function advance(time: number) {
      const viewport = viewportRef.current;
      if (!viewport) {
        stopScrolling();
        return;
      }
      const end = viewport.scrollWidth - viewport.clientWidth;
      if (end - viewport.scrollLeft <= spacing.px) {
        viewport.scrollLeft = end;
        stopScrolling();
        return;
      }
      const elapsed =
        previousTimeRef.current === null
          ? 0
          : Math.min(time - previousTimeRef.current, motion.duration.fast);
      previousTimeRef.current = time;
      viewport.scrollLeft +=
        (motion.gesture.horizontalEdgeScrollSpeed * elapsed) / 1000;
      frameRef.current = requestAnimationFrame(advance);
    }
    frameRef.current = requestAnimationFrame(advance);
  }, [stopScrolling]);

  useEffect(() => {
    window.addEventListener("blur", stopScrolling);
    return () => {
      window.removeEventListener("blur", stopScrolling);
      stopScrolling();
    };
  }, [stopScrolling]);

  return (
    <ScrollAreaPrimitive.Root
      {...props}
      data-slot="horizontal-scroll-area"
      onPointerMove={(event) => {
        onPointerMove?.(event);
        const viewport = viewportRef.current;
        const bounds = viewport?.getBoundingClientRect();
        if (
          !event.defaultPrevented &&
          scrollRightLabel &&
          event.pointerType === "mouse" &&
          event.buttons === 0 &&
          bounds &&
          event.clientX >= bounds.right - spacing[12] &&
          event.clientX <= bounds.right &&
          event.clientY >= bounds.top &&
          event.clientY <= bounds.bottom
        ) {
          startScrolling();
        } else stopScrolling();
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        stopScrolling();
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        stopScrolling();
      }}
      className={cn(
        "group/horizontal-scroll relative w-full min-w-0 overflow-hidden",
        scrollbarVisibility === "desktop"
          ? "lg:data-[has-overflow-x]:pb-5"
          : "data-[has-overflow-x]:pb-5",
        className,
      )}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="horizontal-scroll-viewport"
        aria-label={label}
        role="region"
        tabIndex={0}
        className={cn(
          "w-full min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          fadeEdges &&
            "[--scroll-fade-start:currentColor] [--scroll-fade-end:currentColor] data-[overflow-x-start]:[--scroll-fade-start:transparent] data-[overflow-x-end]:[--scroll-fade-end:transparent] [mask-image:linear-gradient(to_right,var(--scroll-fade-start),currentColor_var(--spacing-6),currentColor_calc(100%_-_var(--spacing-6)),var(--scroll-fade-end))]",
        )}
      >
        <ScrollAreaPrimitive.Content>{children}</ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      {scrollRightLabel ? (
        <div
          data-slot="horizontal-scroll-edge"
          className={cn(
            "pointer-events-none absolute top-0 right-0 hidden w-12 items-center justify-end bg-linear-to-r from-transparent to-background group-data-[overflow-x-end]/horizontal-scroll:flex",
            scrollbarVisibility === "desktop"
              ? "bottom-0 lg:bottom-5"
              : "bottom-5",
          )}
        >
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label={scrollRightLabel}
            className="pointer-events-auto mr-1 rounded-full"
            onClick={() => {
              stopScrolling();
              viewportRef.current?.scrollBy({
                left: spacing[72] + spacing[6],
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "instant"
                  : "smooth",
              });
            }}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </Button>
        </div>
      ) : null}
      <ScrollAreaPrimitive.Scrollbar
        data-slot="horizontal-scrollbar"
        orientation="horizontal"
        className={cn(
          "h-3 rounded-full bg-muted p-0.5",
          scrollbarVisibility === "desktop" ? "hidden lg:flex" : "flex",
        )}
      >
        <ScrollAreaPrimitive.Thumb
          data-slot="horizontal-scroll-thumb"
          className="h-full rounded-full bg-border-strong hover:bg-muted-foreground"
        />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  );
}
