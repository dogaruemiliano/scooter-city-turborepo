"use client";

import {
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { Toast as Primitive } from "@base-ui/react/toast";
import type { ToastManagerAddOptions } from "@base-ui/react/toast";
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { motion } from "@repo/theme";
import { cn } from "@repo/ui/lib/utils";
import { buttonVariants } from "./button";

export type ToastVariant =
  | "neutral"
  | "success"
  | "info"
  | "warning"
  | "error"
  | "loading";
export type ToastOptions = Omit<
  ToastManagerAddOptions<Record<string, unknown>>,
  "type"
> & {
  variant?: ToastVariant;
  /** Recovery-only feedback stays visible until the feature resolves it. */
  dismissible?: boolean;
  /** Follow this surface above its current position, at the same width. */
  anchorRef?: RefObject<HTMLElement | null>;
  /** Icon actions can occupy the trailing close-control position. */
  actionPlacement?: "trailing";
  /** Replace the action content with a spinner and block repeat activation. */
  actionPending?: boolean;
};
export type ToastPosition =
  | "top-start"
  | "top-center"
  | "top-end"
  | "bottom-start"
  | "bottom-center"
  | "bottom-end";
export type ToastProviderProps = ComponentProps<typeof Primitive.Provider> & {
  position?: ToastPosition;
  surface?: "floating" | "solid";
  closeLabel?: string;
  viewportLabel?: string;
  viewportClassName?: string;
  toastClassName?: string;
  renderIcon?: (variant: ToastVariant) => ReactNode;
};

const positions: Record<ToastPosition, string> = {
  "top-start": "top-[calc(var(--spacing-20)+env(safe-area-inset-top))] start-4",
  "top-center":
    "top-[calc(var(--spacing-20)+env(safe-area-inset-top))] left-1/2 -translate-x-1/2",
  "top-end": "top-[calc(var(--spacing-20)+env(safe-area-inset-top))] end-4",
  "bottom-start":
    "bottom-[calc(var(--spacing-4)+env(safe-area-inset-bottom))] start-4",
  "bottom-center":
    "bottom-[calc(var(--spacing-4)+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2",
  "bottom-end":
    "bottom-[calc(var(--spacing-4)+env(safe-area-inset-bottom))] end-4",
};
const icons = {
  neutral: InfoIcon,
  info: InfoIcon,
  success: CheckCircle2Icon,
  warning: TriangleAlertIcon,
  error: CircleAlertIcon,
  loading: LoaderCircleIcon,
};
const tones = {
  neutral: "text-muted-foreground",
  info: "text-info",
  success: "text-success",
  warning: "text-warning-text",
  error: "text-destructive",
  loading: "text-primary",
};

/** Mount once around the application (or a Storybook example). */
export function ToastProvider({
  children,
  position = "top-center",
  surface = "floating",
  closeLabel = "Dismiss notification",
  viewportLabel = "Notifications",
  viewportClassName,
  toastClassName,
  renderIcon,
  timeout = motion.duration.toastDismiss,
  ...props
}: ToastProviderProps) {
  return (
    <Primitive.Provider timeout={timeout} {...props}>
      {children}
      <ToastViewport
        timeout={timeout}
        position={position}
        surface={surface}
        closeLabel={closeLabel}
        viewportLabel={viewportLabel}
        viewportClassName={viewportClassName}
        toastClassName={toastClassName}
        renderIcon={renderIcon}
      />
    </Primitive.Provider>
  );
}

function ToastViewport({
  timeout,
  position,
  surface,
  closeLabel,
  viewportLabel,
  viewportClassName,
  toastClassName,
  renderIcon,
}: Required<
  Pick<
    ToastProviderProps,
    "position" | "surface" | "closeLabel" | "viewportLabel" | "timeout"
  >
> &
  Pick<
    ToastProviderProps,
    "viewportClassName" | "toastClassName" | "renderIcon"
  >) {
  const { toasts } = Primitive.useToastManager();
  return (
    <Primitive.Portal>
      <Primitive.Viewport
        aria-label={viewportLabel}
        data-slot="toast-viewport"
        className={cn(
          "pointer-events-none fixed z-toast flex w-96 max-w-[calc(100vw-var(--spacing-8))] flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          positions[position],
          viewportClassName,
        )}
      >
        {toasts
          .filter((toast) => !toast.data?.anchorRef)
          .map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              timeout={timeout}
              position={position}
              surface={surface}
              closeLabel={closeLabel}
              toastClassName={toastClassName}
              renderIcon={renderIcon}
            />
          ))}
      </Primitive.Viewport>
      {toasts
        .filter((toast) => toast.data?.anchorRef)
        .map((toast) => (
          <AnchoredToastViewport
            key={toast.id}
            anchorRef={toast.data!.anchorRef as RefObject<HTMLElement | null>}
            label={viewportLabel}
          >
            <ToastItem
              toast={toast}
              timeout={timeout}
              position={position}
              surface={surface}
              closeLabel={closeLabel}
              toastClassName={toastClassName}
              renderIcon={renderIcon}
            />
          </AnchoredToastViewport>
        ))}
    </Primitive.Portal>
  );
}

function AnchoredToastViewport({
  anchorRef,
  label,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const popup = viewport.current;
    if (!anchor || !popup) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = anchor.getBoundingClientRect();
      popup.style.left = `${rect.left}px`;
      popup.style.width = `${rect.width}px`;
      popup.style.top = `calc(${rect.top}px - var(--spacing-3))`;
      popup.style.visibility =
        anchor.isConnected && rect.width > 0 ? "visible" : "hidden";
      if (
        anchor
          .getAnimations()
          .some((animation) => animation.playState === "running")
      )
        schedule();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(anchor);
    window.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    anchor.addEventListener("animationstart", schedule);
    anchor.addEventListener("transitionrun", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      anchor.removeEventListener("animationstart", schedule);
      anchor.removeEventListener("transitionrun", schedule);
    };
  }, [anchorRef]);
  return (
    <Primitive.Viewport
      ref={viewport}
      aria-label={label}
      data-slot="anchored-toast-viewport"
      className="pointer-events-none fixed z-toast -translate-y-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Primitive.Viewport>
  );
}

function ToastItem({
  toast,
  timeout,
  position,
  surface,
  closeLabel,
  toastClassName,
  renderIcon,
}: {
  toast: ComponentProps<typeof Primitive.Root>["toast"];
  timeout: number;
} & Pick<ToastProviderProps, "toastClassName" | "renderIcon"> &
  Required<Pick<ToastProviderProps, "position" | "surface" | "closeLabel">>) {
  const variant: ToastVariant =
    toast.type && toast.type in icons
      ? (toast.type as ToastVariant)
      : "neutral";
  const Icon = icons[variant];
  const displayedToast =
    toast.data?.actionPending && toast.actionProps
      ? {
          ...toast,
          actionProps: {
            ...toast.actionProps,
            children: (
              <LoaderCircleIcon
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ),
            disabled: true,
            "aria-busy": true as const,
          },
        }
      : toast;
  const hasDescription =
    typeof toast.description === "string"
      ? Boolean(toast.description.trim())
      : Boolean(toast.description);
  return (
    <Primitive.Root
      toast={displayedToast}
      onKeyDownCapture={(event) => {
        if (toast.data?.dismissible === false && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      swipeDirection={
        toast.data?.dismissible === false
          ? []
          : position.startsWith("top")
            ? "up"
            : "down"
      }
      data-slot="toast"
      data-variant={variant}
      className={cn(
        "pointer-events-auto relative overflow-hidden rounded-xl bg-card p-4 text-card-foreground shadow-lg transition-[opacity,transform] duration-normal ease-decelerate outline-none focus-visible:ring-2 focus-visible:ring-ring data-starting-style:-translate-y-2 data-starting-style:opacity-0 data-ending-style:opacity-0 data-limited:hidden motion-reduce:transition-none",
        surface === "floating" &&
          "supports-[backdrop-filter:blur(0)]:bg-floating-action-surface supports-[backdrop-filter:blur(0)]:backdrop-blur-floating-surface",
        toastClassName,
      )}
    >
      <Primitive.Content
        className={cn(
          "flex gap-3",
          hasDescription ? "items-start" : "items-center",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-5 shrink-0 items-center justify-center",
            tones[variant],
          )}
        >
          {renderIcon ? (
            renderIcon(variant)
          ) : (
            <Icon
              className={cn(
                "size-5",
                variant === "loading" &&
                  "animate-spin motion-reduce:animate-none",
              )}
            />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Primitive.Title className="text-sm font-semibold wrap-anywhere" />
          {hasDescription ? (
            <Primitive.Description className="text-sm text-muted-foreground wrap-anywhere" />
          ) : null}
          {toast.actionProps && toast.data?.actionPlacement !== "trailing" ? (
            <Primitive.Action
              disabled={
                Boolean(toast.data?.actionPending) || toast.actionProps.disabled
              }
              aria-busy={toast.data?.actionPending ? true : undefined}
              className={cn(
                buttonVariants({ variant: "text", size: "sm" }),
                "mt-2 self-start",
              )}
            />
          ) : null}
        </div>
        {toast.actionProps && toast.data?.actionPlacement === "trailing" ? (
          <Primitive.Action
            disabled={
              Boolean(toast.data?.actionPending) || toast.actionProps.disabled
            }
            aria-busy={toast.data?.actionPending ? true : undefined}
            className={buttonVariants({ variant: "ghost", size: "icon-xs" })}
          />
        ) : null}
        {toast.data?.dismissible !== false ? (
          <Primitive.Close
            aria-hidden={false}
            aria-label={closeLabel}
            className={buttonVariants({
              variant: "ghost",
              size: "icon-xs",
            })}
          >
            <XIcon aria-hidden="true" />
          </Primitive.Close>
        ) : null}
      </Primitive.Content>
      {variant !== "loading" && (toast.timeout ?? timeout) > 0 ? (
        <ToastCountdown
          duration={toast.timeout ?? timeout}
          revision={toast.data?.countdownRevision}
          ending={toast.transitionStatus === "ending"}
          tone={tones[variant]}
        />
      ) : null}
    </Primitive.Root>
  );
}

/** Mirrors the primitive's public expanded state and window-focus timer pauses. */
function ToastCountdown({
  duration,
  revision,
  ending,
  tone,
}: {
  duration: number;
  revision: unknown;
  ending: boolean;
  tone: string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const windowBlurred = useRef(false);
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element?.animate || ending) return;
    const animation = element.animate(
      [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }],
      { duration, easing: motion.easing.linear, fill: "forwards" },
    );
    const viewport = element.closest(
      '[data-slot="toast-viewport"], [data-slot="anchored-toast-viewport"]',
    );
    // The primitive starts timers immediately, including in an unfocused document;
    // only a subsequent window blur pauses them.
    const sync = () => {
      if (windowBlurred.current || viewport?.hasAttribute("data-expanded"))
        animation.pause();
      else animation.play();
    };
    const blur = () => {
      windowBlurred.current = true;
      sync();
    };
    const focus = () => {
      windowBlurred.current = false;
      sync();
    };
    const observer = new MutationObserver(sync);
    if (viewport)
      observer.observe(viewport, {
        attributes: true,
        attributeFilter: ["data-expanded"],
      });
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    sync();
    return () => {
      observer.disconnect();
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      animation.cancel();
    };
  }, [duration, revision, ending]);
  return (
    <div
      aria-hidden="true"
      data-slot="toast-countdown"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-0.5",
        tone,
        ending && "invisible",
      )}
    >
      <div ref={bar} className="h-full w-full origin-left bg-current" />
    </div>
  );
}

let countdownRevision = 0;

function options(
  {
    variant,
    dismissible,
    anchorRef,
    actionPlacement,
    actionPending,
    ...rest
  }: ToastOptions,
  resetTimer = false,
): ToastManagerAddOptions<Record<string, unknown>> {
  const refreshCountdown = resetTimer || Object.hasOwn(rest, "timeout");
  return {
    ...rest,
    ...(variant ? { type: variant } : {}),
    ...(dismissible !== undefined ||
    anchorRef !== undefined ||
    actionPlacement !== undefined ||
    actionPending !== undefined ||
    refreshCountdown
      ? {
          data: {
            ...rest.data,
            ...(refreshCountdown
              ? { countdownRevision: ++countdownRevision }
              : {}),
            ...(dismissible !== undefined ? { dismissible } : {}),
            ...(anchorRef ? { anchorRef } : {}),
            ...(actionPlacement ? { actionPlacement } : {}),
            ...(actionPending !== undefined ? { actionPending } : {}),
          },
        }
      : {}),
    ...(dismissible === false ? { timeout: 0 } : {}),
    ...(variant === "error" || variant === "loading"
      ? { timeout: dismissible === false ? 0 : (rest.timeout ?? 0) }
      : {}),
  };
}

export function useToast() {
  const manager = Primitive.useToastManager();
  return {
    add: (value: ToastOptions) => manager.add(options(value, true)),
    update: (id: string, value: ToastOptions) => {
      const next = options(value);
      const previous = manager.toasts.find((toast) => toast.id === id);
      manager.update(id, {
        ...next,
        ...(next.data
          ? {
              data: {
                ...next.data,
                countdownRevision:
                  next.data.countdownRevision ??
                  previous?.data?.countdownRevision,
              },
            }
          : {}),
      });
    },
    dismiss: manager.close,
    promise: <T,>(
      promise: Promise<T>,
      config: {
        loading: ToastOptions;
        success: ToastOptions | ((value: T) => ToastOptions);
        error: ToastOptions | ((error: unknown) => ToastOptions);
      },
    ) =>
      manager.promise(promise, {
        loading: options({ variant: "loading", ...config.loading }),
        success: (value: T) =>
          options({
            variant: "success",
            timeout: motion.duration.toastDismiss,
            ...(typeof config.success === "function"
              ? config.success(value)
              : config.success),
          }),
        error: (error: unknown) =>
          options({
            variant: "error",
            ...(typeof config.error === "function"
              ? config.error(error)
              : config.error),
          }),
      }),
  };
}
