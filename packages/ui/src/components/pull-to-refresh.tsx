"use client";

import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { tokens } from "@repo/theme";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";
import { cn } from "@repo/ui/lib/utils";
import { Button } from "./button";
import { Spinner } from "./spinner";

export type PullToRefreshProps = ComponentProps<"div"> & {
  enabled?: boolean;
  disabled?: boolean;
  /** Request activity, including background loads. Only an explicit refresh opens the indicator. */
  refreshing: boolean;
  onRefresh: () => void;
  labels: {
    pull: string;
    release: string;
    refreshing: string;
    refresh: string;
  };
};

const gesture = tokens.motion.gesture.pullToRefresh;
const ignoredTargets =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [draggable="true"], [data-pull-to-refresh-ignore], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * Render directly inside the existing scrollport; this component never scrolls.
 * Only a single-finger downward pull starting at the top on mobile can refresh.
 * onRefresh must start a request reflected in refreshing until it settles.
 */
export function PullToRefresh({
  enabled = true,
  disabled = false,
  refreshing,
  onRefresh,
  labels,
  className,
  children,
  ...props
}: PullToRefreshProps) {
  const mobile = useIsMobile();
  const root = useRef<HTMLDivElement>(null);
  const locked = useRef(false);
  const observedRequest = useRef(false);
  const [requested, setRequested] = useState(false);
  const [distance, setDistance] = useState(0);
  const available = mobile && enabled;

  useEffect(() => {
    if (!locked.current) return;
    if (refreshing) observedRequest.current = true;
    else if (observedRequest.current) {
      observedRequest.current = false;
      locked.current = false;
      setRequested(false);
    }
  }, [refreshing]);

  const refresh = useCallback(() => {
    if (!available || disabled || refreshing || locked.current) return;
    locked.current = true;
    observedRequest.current = false;
    setRequested(true);
    onRefresh();
  }, [available, disabled, refreshing, onRefresh]);

  useEffect(() => {
    const scrollport = root.current?.parentElement;
    if (!available || disabled || refreshing || !scrollport) return;
    let start: { x: number; y: number; id: number } | null = null;
    let travel = 0;
    const cancel = () => {
      start = null;
      travel = 0;
      setDistance(0);
    };
    const begin = (event: TouchEvent) => {
      cancel();
      const target = event.target;
      if (
        locked.current ||
        event.defaultPrevented ||
        event.touches.length !== 1 ||
        scrollport.scrollTop > 0 ||
        !(target instanceof Element) ||
        !root.current?.contains(target) ||
        target.closest(ignoredTargets) ||
        scrollport.closest('[inert], [aria-hidden="true"]')
      )
        return;
      // Native listeners exclude portalled sheets. Also leave nested scrollers
      // and horizontal rails in control of gestures that begin inside them.
      for (
        let node: Element | null = target;
        node && node !== scrollport;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        if (
          /(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`) ||
          style.touchAction === "none"
        )
          return;
      }
      const touch = event.touches[0]!;
      start = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.touches[0];
      if (
        event.touches.length !== 1 ||
        !touch ||
        touch.identifier !== start.id ||
        scrollport.scrollTop > 0 ||
        event.defaultPrevented
      )
        return cancel();
      const y = touch.clientY - start.y;
      const x = Math.abs(touch.clientX - start.x);
      if (y <= 0 || (x >= gesture.axisLockDistance && x > y)) return cancel();
      // Cancel the first downward move before Safari commits to native bounce.
      // Regular scrolling, horizontal swipes and pinch zoom remain untouched.
      if (y <= x) return;
      if (!event.cancelable) return cancel();
      event.preventDefault();
      travel = y >= gesture.axisLockDistance ? y : 0;
      setDistance(travel);
    };
    const end = (event: TouchEvent) => {
      const commit =
        start !== null &&
        scrollport.scrollTop <= 0 &&
        event.touches.length === 0 &&
        travel >= gesture.threshold;
      cancel();
      if (commit) refresh();
    };
    scrollport.addEventListener("touchstart", begin, { passive: true });
    scrollport.addEventListener("touchmove", move, { passive: false });
    scrollport.addEventListener("touchend", end, { passive: true });
    scrollport.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      scrollport.removeEventListener("touchstart", begin);
      scrollport.removeEventListener("touchmove", move);
      scrollport.removeEventListener("touchend", end);
      scrollport.removeEventListener("touchcancel", cancel);
      cancel();
    };
  }, [available, disabled, refreshing, refresh]);

  // Background loading must not reveal the indicator or move page content.
  const busy = requested;
  const ready = distance >= gesture.threshold;
  return (
    <div
      ref={root}
      data-slot="pull-to-refresh"
      className={cn("relative flex min-w-0 flex-1 flex-col", className)}
      {...props}
    >
      {available ? (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || refreshing || busy}
            onClick={refresh}
            className="sr-only focus:not-sr-only focus:absolute focus:right-3 focus:top-3 focus:z-raised"
          >
            {labels.refresh}
          </Button>
          <div
            data-slot="pull-to-refresh-reveal"
            role={busy || distance > 0 ? "status" : undefined}
            aria-live="polite"
            aria-atomic="true"
            className={cn(
              "pointer-events-none relative shrink-0 overflow-hidden transition-[height] duration-slow ease-decelerate motion-reduce:transition-none",
              distance > 0 && !busy && "transition-none",
            )}
            style={{
              height: busy
                ? gesture.maxTravel
                : Math.min(distance * gesture.resistance, gesture.maxTravel),
            }}
          >
            {/* Keep the spinner mounted and spinning through the pull, request
                and return animation. Only its clipping window changes. */}
            <div
              data-slot="pull-to-refresh-spinner"
              className="absolute inset-x-0 top-0 flex items-center justify-center"
              style={{ height: gesture.maxTravel }}
            >
              <Spinner className="size-6 text-muted-foreground" />
            </div>
            <span className="sr-only">
              {busy
                ? labels.refreshing
                : distance > 0
                  ? ready
                    ? labels.release
                    : labels.pull
                  : null}
            </span>
          </div>
        </>
      ) : null}
      {children}
    </div>
  );
}
