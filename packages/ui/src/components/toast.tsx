"use client";

import type { ComponentProps, ReactNode } from "react";
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
    "position" | "surface" | "closeLabel" | "viewportLabel"
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
        {toasts.map((toast) => {
          const variant: ToastVariant =
            toast.type && toast.type in icons
              ? (toast.type as ToastVariant)
              : "neutral";
          const Icon = icons[variant];
          return (
            <Primitive.Root
              key={toast.id}
              toast={toast}
              swipeDirection={position.startsWith("top") ? "up" : "down"}
              data-slot="toast"
              data-variant={variant}
              className={cn(
                "pointer-events-auto rounded-xl bg-card p-4 text-card-foreground shadow-lg transition-[opacity,transform] duration-normal ease-decelerate outline-none focus-visible:ring-2 focus-visible:ring-ring data-starting-style:-translate-y-2 data-starting-style:opacity-0 data-ending-style:opacity-0 data-limited:hidden motion-reduce:transition-none",
                surface === "floating" &&
                  "supports-[backdrop-filter:blur(0)]:bg-floating-action-surface supports-[backdrop-filter:blur(0)]:backdrop-blur-floating-surface",
                toastClassName,
              )}
            >
              <Primitive.Content className="flex items-start gap-3">
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
                  <Primitive.Description className="text-sm text-muted-foreground wrap-anywhere" />
                  {toast.actionProps ? (
                    <Primitive.Action
                      className={cn(
                        buttonVariants({ variant: "text", size: "sm" }),
                        "mt-2 self-start",
                      )}
                    />
                  ) : null}
                </div>
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
              </Primitive.Content>
            </Primitive.Root>
          );
        })}
      </Primitive.Viewport>
    </Primitive.Portal>
  );
}

function options({
  variant,
  ...rest
}: ToastOptions): ToastManagerAddOptions<Record<string, unknown>> {
  return {
    ...rest,
    ...(variant ? { type: variant } : {}),
    ...(variant === "error" || variant === "loading"
      ? { timeout: rest.timeout ?? 0 }
      : {}),
  };
}

export function useToast() {
  const manager = Primitive.useToastManager();
  return {
    add: (value: ToastOptions) => manager.add(options(value)),
    update: (id: string, value: ToastOptions) =>
      manager.update(id, options(value)),
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
