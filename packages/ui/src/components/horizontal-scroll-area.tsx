"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ComponentProps,
} from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, spacing, scrollFade } from "@repo/theme";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

type HorizontalScrollAreaProps = Omit<
  ComponentProps<typeof ScrollAreaPrimitive.Root>,
  "className"
> & {
  className?: string;
  label: string;
  /** Keep edge fades fixed over matching content padding. "always" is an alias for true. */
  fadeEdges?: boolean | "always";
  /** A theme token or inherited surface spacing variable for the edge fade width. */
  fadeWidth?: string;
  /** Snap gently to children with snap-start without trapping touch scrolling. */
  snap?: boolean;
  /** Base percentage-sized cards on the viewport instead of intrinsic content width. */
  contentWidth?: "intrinsic" | "viewport";
  /** Show the scrollbar always, only on desktop, or hide it while preserving scrolling. */
  scrollbarVisibility?: "always" | "desktop" | "hidden";
  /** Enables a left-edge arrow and mouse-hover scrolling across the full viewport height. */
  scrollLeftLabel?: string;
  /** Enables a right-edge arrow and mouse-hover scrolling across the full viewport height. */
  scrollRightLabel?: string;
};

/** A native scrolling viewport with an optional draggable overflow indicator. */
export function HorizontalScrollArea({
  children,
  className,
  label,
  fadeEdges = false,
  fadeWidth = "var(--spacing-6)",
  snap = false,
  contentWidth = "intrinsic",
  scrollbarVisibility = "always",
  scrollLeftLabel,
  scrollRightLabel,
  onPointerMove,
  onPointerLeave,
  onPointerDown,
  ...props
}: HorizontalScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const previousTimeRef = useRef<number | null>(null);
  const directionRef = useRef<-1 | 1>(1);
  const stopScrolling = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    previousTimeRef.current = null;
  }, []);

  const startScrolling = useCallback(
    (direction: -1 | 1) => {
      if (frameRef.current !== null && directionRef.current === direction)
        return;
      stopScrolling();
      directionRef.current = direction;
      function advance(time: number) {
        const viewport = viewportRef.current;
        if (!viewport) {
          stopScrolling();
          return;
        }
        const end = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
        const remaining =
          direction === -1 ? viewport.scrollLeft : end - viewport.scrollLeft;
        if (remaining <= spacing.px) {
          viewport.scrollLeft = direction === -1 ? 0 : end;
          stopScrolling();
          return;
        }
        const elapsed =
          previousTimeRef.current === null
            ? 0
            : Math.min(time - previousTimeRef.current, motion.duration.fast);
        previousTimeRef.current = time;
        viewport.scrollLeft +=
          (direction * motion.gesture.horizontalEdgeScrollSpeed * elapsed) /
          1000;
        frameRef.current = requestAnimationFrame(advance);
      }
      frameRef.current = requestAnimationFrame(advance);
    },
    [stopScrolling],
  );

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
          event.pointerType === "mouse" &&
          event.buttons === 0 &&
          bounds &&
          event.clientX >= bounds.left &&
          event.clientX <= bounds.right &&
          event.clientY >= bounds.top &&
          event.clientY <= bounds.bottom
        ) {
          if (scrollLeftLabel && event.clientX <= bounds.left + spacing[12]) {
            startScrolling(-1);
          } else if (
            scrollRightLabel &&
            event.clientX >= bounds.right - spacing[12]
          ) {
            startScrolling(1);
          } else stopScrolling();
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
        scrollbarVisibility !== "hidden" &&
          (scrollbarVisibility === "desktop"
            ? "lg:data-[has-overflow-x]:pb-5"
            : "data-[has-overflow-x]:pb-5"),
        className,
      )}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="horizontal-scroll-viewport"
        aria-label={label}
        role="region"
        style={
          {
            "--scroll-fade-width": fadeWidth,
            maskImage: fadeEdges ? scrollFade.softMask : undefined,
          } as CSSProperties
        }
        tabIndex={0}
        className={cn(
          "w-full min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          snap && "snap-x snap-proximity",
          fadeEdges &&
            "[--scroll-fade-start:transparent] [--scroll-fade-end:transparent] scroll-px-(--scroll-fade-width)",
        )}
      >
        <ScrollAreaPrimitive.Content
          style={
            contentWidth === "viewport"
              ? { minWidth: 0, width: "100%" }
              : undefined
          }
        >
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      {([-1, 1] as const).map((direction) => {
        const scrollLabel =
          direction === -1 ? scrollLeftLabel : scrollRightLabel;
        const Icon = direction === -1 ? ChevronLeft : ChevronRight;
        return scrollLabel ? (
          <div
            key={direction}
            data-slot="horizontal-scroll-edge"
            data-direction={direction === -1 ? "left" : "right"}
            className={cn(
              "pointer-events-none absolute top-0 hidden w-12 items-center",
              direction === -1
                ? "left-0 justify-start group-data-[overflow-x-start]/horizontal-scroll:flex"
                : "right-0 justify-end group-data-[overflow-x-end]/horizontal-scroll:flex",
              scrollbarVisibility === "hidden"
                ? "bottom-0"
                : scrollbarVisibility === "desktop"
                  ? "bottom-0 lg:bottom-5"
                  : "bottom-5",
            )}
          >
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label={scrollLabel}
              className={cn(
                "pointer-events-auto rounded-full",
                direction === -1 ? "ml-1" : "mr-1",
              )}
              onClick={() => {
                stopScrolling();
                viewportRef.current?.scrollBy({
                  left: direction * (spacing[72] + spacing[6]),
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "instant"
                    : "smooth",
                });
              }}
            >
              <Icon aria-hidden="true" className="size-5" />
            </Button>
          </div>
        ) : null;
      })}
      <ScrollAreaPrimitive.Scrollbar
        data-slot="horizontal-scrollbar"
        orientation="horizontal"
        className={cn(
          "h-3 rounded-full bg-muted p-0.5",
          scrollbarVisibility === "hidden"
            ? "hidden"
            : scrollbarVisibility === "desktop"
              ? "hidden lg:flex"
              : "flex",
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
