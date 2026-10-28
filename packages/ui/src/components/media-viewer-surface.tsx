"use client";
import type { ReactNode, Ref } from "react";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { SaveButton } from "./save-button";
import { cn } from "../lib/utils";

export const mediaViewerSurfaceClassName =
  "inset-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-popover p-0 text-popover-foreground transition-none sm:max-w-none md:inset-auto md:top-1/2 md:left-1/2 md:h-(--container-media-viewer-height) md:max-h-(--container-media-viewer-height) md:w-(--container-media-viewer-width) md:max-w-(--container-media-viewer-max) md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:shadow-xl data-open:slide-in-from-bottom data-closed:slide-out-to-bottom";

/** Shared desktop modal and full-screen mobile surface for media evidence. */
export function MediaViewerSurface({
  open,
  onOpenChange,
  title,
  children,
  hasSource,
  slot = "media-viewer",
  review,
  reviewTitle,
  navigation,
  error,
  onSave,
  saveLabel,
  disabled,
  footer,
  contentRef,
  saving,
  pendingLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  hasSource?: boolean;
  slot?: string;
  review?: ReactNode;
  reviewTitle?: string;
  navigation?: ReactNode;
  error?: string | null;
  onSave?: () => void;
  saveLabel?: string;
  disabled?: boolean;
  footer?: ReactNode;
  contentRef?: Ref<HTMLDivElement>;
  saving?: boolean;
  pendingLabel?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent
        ref={contentRef}
        showCloseButton={false}
        data-slot={slot}
        className={mediaViewerSurfaceClassName}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <div
            className={cn(
              "relative flex min-h-0 flex-1 flex-col overflow-hidden bg-control",
              review &&
                hasSource &&
                "h-(--container-document-review) shrink-0 flex-none lg:h-auto lg:flex-1",
            )}
            data-slot="document-viewer-body"
          >
            {children}
          </div>
          {review ? (
            <aside
              aria-label={reviewTitle}
              data-slot="document-review"
              className="flex shrink-0 flex-col gap-6 rounded-t-3xl border-t border-border bg-popover p-6 text-popover-foreground lg:w-96 lg:overflow-y-auto lg:rounded-none lg:border-t-0 lg:border-l"
            >
              <div
                aria-hidden="true"
                className="mx-auto h-1 w-12 shrink-0 rounded-full bg-muted-foreground/40 lg:hidden"
              />
              {reviewTitle ? (
                <h2 className="text-base font-semibold">{reviewTitle}</h2>
              ) : null}
              {review}
            </aside>
          ) : null}
        </div>
        {navigation || error || onSave || footer ? (
          <div className="flex shrink-0 flex-col gap-1 bg-popover px-2 pt-1 pb-[max(var(--spacing-2),env(safe-area-inset-bottom))] text-popover-foreground">
            {navigation}
            {error ? (
              <p role="alert" className="text-center text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {onSave ? (
              <SaveButton
                type="button"
                state={saving ? "pending" : "idle"}
                idleLabel={saveLabel ?? title}
                pendingLabel={pendingLabel ?? saveLabel ?? title}
                successLabel={saveLabel ?? title}
                onClick={onSave}
                disabled={disabled || !hasSource}
                className="w-full"
              />
            ) : null}
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
