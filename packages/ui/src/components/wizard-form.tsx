"use client";

import { motion, zIndex } from "@repo/theme";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@repo/ui/lib/utils";
import { StepProgress } from "./step-progress";

export type WizardFormStep = {
  id: string;
  label: string;
  content: ReactNode;
};

export type WizardFormProps = Omit<
  ComponentProps<"form">,
  "onChange" | "dir"
> & {
  steps: readonly WizardFormStep[];
  activeIndex: number;
  progressLabel: string;
  /** Keep step headings accessible while the mobile app header supplies the title. */
  hideHeadingOnMobile?: boolean;
  /** Requests an adjacent step. The owner validates and updates activeIndex. */
  onStepChange: (index: number) => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  /** Blocks gestures during submission or while another surface is open. */
  disabled?: boolean;
  dir?: "ltr" | "rtl";
  /** Remains outside the moving panels, so sticky FormActions stay sticky. */
  footer?: ReactNode;
};

type Gesture = {
  pointerId: number;
  index: number;
  x: number;
  y: number;
  width: number;
  horizontal: boolean;
  offset: number;
};

const directManipulationTarget =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="spinbutton"], [role="textbox"], [data-wizard-no-swipe]';
const clickableTarget = 'a, button, label, [role="button"]';

/** A pointer may become inactive before capture cleanup runs on touch browsers. */
function releaseCapture(element: HTMLElement, pointerId: number) {
  try {
    if (element.hasPointerCapture?.(pointerId))
      element.releasePointerCapture(pointerId);
  } catch (error) {
    // hasPointerCapture can still report true while the pointer is ending.
    if (!(error instanceof DOMException && error.name === "NotFoundError"))
      throw error;
  }
}

/**
 * Controlled wizard shell. Own field values above it: inactive panels unmount
 * after the transition. Swipes request navigation, never submit the form.
 * Use buttons in footer for keyboard/assistive navigation; progress is read-only.
 * Panels inherit the form's opaque page surface. Use bg-popover/bg-card on the
 * form when embedding it on another surface so overlapping screens stay opaque.
 * Owns horizontal gutters: give the form an unpadded container so the moving
 * surfaces reach its edges while fields, progress, and actions remain inset.
 */
export function WizardForm({
  steps,
  activeIndex,
  progressLabel,
  hideHeadingOnMobile = false,
  onStepChange,
  canGoNext = true,
  canGoPrevious = true,
  disabled = false,
  dir = "ltr",
  footer,
  children,
  className,
  ...props
}: WizardFormProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [view, setView] = useState({
    index: activeIndex,
    previous: activeIndex,
    preview: null as number | null,
    dragging: false,
    offset: 0,
  });

  // Retain the outgoing panel for its exit animation. Derive this before paint
  // so external buttons, validation redirects, and gestures take the same path.
  if (view.index !== activeIndex) {
    setView({
      index: activeIndex,
      previous: view.index,
      preview: null,
      dragging: false,
      offset: 0,
    });
  }

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [activeIndex]);

  useEffect(() => {
    if (
      view.dragging ||
      (view.previous === activeIndex && view.preview === null)
    )
      return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => {
        setView((current) => ({
          ...current,
          previous: current.index,
          preview: null,
        }));
      },
      reduced ? motion.duration.instant : motion.duration.normal,
    );
    return () => window.clearTimeout(timer);
  }, [activeIndex, view.dragging, view.previous, view.preview]);

  const direction = dir === "rtl" ? -1 : 1;
  const offset = disabled ? 0 : view.offset;
  const transitioning =
    view.dragging || view.previous !== activeIndex || view.preview !== null;
  const foregroundIndex = Math.max(
    activeIndex,
    view.previous,
    view.preview ?? activeIndex,
  );

  function allowed(index: number) {
    return (
      !disabled &&
      index >= 0 &&
      index < steps.length &&
      (index > activeIndex ? canGoNext : canGoPrevious)
    );
  }

  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    releaseCapture(event.currentTarget, event.pointerId);
    setView((state) => ({ ...state, dragging: false, offset: 0 }));
    const next = current.index + (current.offset < 0 ? 1 : -1);
    if (
      !cancelled &&
      current.index === activeIndex &&
      current.horizontal &&
      Math.abs(current.offset) >= motion.gesture.wizard.commitFraction &&
      allowed(next)
    )
      onStepChange(next);
  }

  return (
    <form
      {...props}
      dir={dir}
      data-slot="wizard-form"
      className={cn(
        "[--wizard-gutter:var(--spacing-4)] flex min-w-0 flex-1 flex-col gap-6 bg-background px-(--wizard-gutter) sm:[--wizard-gutter:var(--spacing-6)]",
        className,
      )}
    >
      <StepProgress
        label={progressLabel}
        labels={steps.map((step) => step.label)}
        activeIndex={activeIndex}
        visualIndex={activeIndex - offset}
        tracking={view.dragging}
      />
      <div
        data-slot="wizard-viewport"
        data-dragging={view.dragging || undefined}
        className="relative isolate -mx-(--wizard-gutter) -my-1 min-w-0 grow shrink-0 overflow-hidden bg-inherit"
        style={{ touchAction: "pan-y pinch-zoom" }}
        onPointerDown={(event) => {
          if (gesture.current) {
            const pointerId = gesture.current.pointerId;
            gesture.current = null;
            releaseCapture(event.currentTarget, pointerId);
            setView((state) => ({ ...state, dragging: false, offset: 0 }));
            return;
          }
          suppressClick.current = false;
          if (
            disabled ||
            event.defaultPrevented ||
            event.isPrimary === false ||
            event.button !== 0 ||
            !(event.target instanceof Element) ||
            !event.currentTarget.contains(event.target) ||
            event.target.closest(directManipulationTarget) ||
            // Touch can start on a picker card, link, or label: capture only
            // after horizontal intent, and suppress its click after a swipe.
            // Mouse interactions retain ordinary selection/activation behavior.
            (event.pointerType !== "touch" &&
              event.pointerType !== "pen" &&
              event.target.closest(clickableTarget))
          )
            return;
          const width = event.currentTarget.getBoundingClientRect().width;
          if (!width) return;
          gesture.current = {
            pointerId: event.pointerId,
            index: activeIndex,
            x: event.clientX,
            y: event.clientY,
            width,
            horizontal: false,
            offset: 0,
          };
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.pointerId !== event.pointerId) return;
          if (disabled || current.index !== activeIndex) {
            finish(event, true);
            return;
          }
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          if (!current.horizontal) {
            if (
              Math.max(Math.abs(dx), Math.abs(dy)) <
              motion.gesture.wizard.axisLockDistance
            )
              return;
            if (Math.abs(dy) >= Math.abs(dx)) {
              gesture.current = null;
              return;
            }
            current.horizontal = true;
            try {
              event.currentTarget.setPointerCapture?.(event.pointerId);
            } catch (error) {
              if (
                !(
                  error instanceof DOMException &&
                  error.name === "NotFoundError"
                )
              )
                throw error;
              finish(event, true);
              return;
            }
            suppressClick.current = true;
          }
          event.preventDefault();
          const nextOffset = Math.max(
            -1,
            Math.min(1, (dx * direction) / current.width),
          );
          const next = activeIndex + (nextOffset < 0 ? 1 : -1);
          current.offset = allowed(next) ? nextOffset : 0;
          setView((state) => ({
            ...state,
            dragging: true,
            offset: current.offset,
            preview: allowed(next) ? next : state.preview,
          }));
        }}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => {
          // Touch starts with implicit capture on the touched child. Its lost
          // capture bubbles when we take over; only losing OUR capture cancels.
          if (event.target === event.currentTarget) finish(event, true);
        }}
        onClickCapture={(event) => {
          if (suppressClick.current && event.detail !== 0) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        {steps.map((step, index) => {
          const active = index === activeIndex;
          const visible =
            active || index === view.previous || index === view.preview;
          // Higher steps sit above earlier ones in a navigation stack. A
          // screen to the left is underneath and travels at half speed; the
          // foreground screen travels the full width. The same coordinates
          // drive dragging, snap-back, and button-triggered CSS transitions.
          const relativePosition = index - activeIndex + offset;
          const travel =
            relativePosition < 0
              ? relativePosition * motion.gesture.wizard.underlayTravelRatio
              : relativePosition;
          return (
            <section
              key={step.id}
              data-slot="wizard-step"
              data-active={active}
              aria-hidden={!active || undefined}
              inert={!active || undefined}
              className={cn(
                "inset-x-0 top-0 min-h-full min-w-0 bg-inherit px-(--wizard-gutter) py-1 transition-transform duration-normal ease-decelerate motion-reduce:transition-none",
                active ? "relative" : "pointer-events-none absolute",
                view.dragging && "select-none",
                transitioning && index === foregroundIndex && "shadow-md",
              )}
              style={{
                transform: `translateX(${travel * direction * 100}%)`,
                // Step order defines local stack order inside the isolated viewport.
                zIndex: zIndex.base + index,
                transitionProperty: view.dragging ? "none" : undefined,
              }}
            >
              {visible ? (
                <fieldset
                  disabled={!active}
                  className="flex min-w-0 flex-col gap-6 border-0 p-0"
                >
                  <h2
                    ref={active ? heading : undefined}
                    tabIndex={-1}
                    className={cn(
                      "text-xl font-semibold outline-none",
                      hideHeadingOnMobile && "sr-only md:not-sr-only",
                    )}
                  >
                    {step.label}
                  </h2>
                  {step.content}
                </fieldset>
              ) : null}
            </section>
          );
        })}
      </div>
      {children}
      {footer}
    </form>
  );
}
