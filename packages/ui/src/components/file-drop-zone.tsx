"use client";

import { useId, useRef } from "react";
import { UploadIcon } from "lucide-react";
import { buttonVariants } from "./button";
import { FileDropOverlay } from "./file-drop-overlay";
import { useFileDrop } from "../hooks/use-file-drop";
import { useIsMobile } from "../hooks/use-mobile";
import { cn } from "../lib/utils";

/** File acquisition only. The feature owns limits, uploads and error handling. */
export function FileDropZone({
  label,
  mobileLabel,
  browseLabel,
  hint,
  requirements,
  accept,
  disabled,
  onFiles,
}: {
  label: string;
  /** Selection-focused copy for the compact mobile card. Defaults to browseLabel. */
  mobileLabel?: string;
  browseLabel: string;
  hint: string;
  requirements?: string;
  accept: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const isMobile = useIsMobile();
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const requirementsId = useId();
  const { dragging, handlers } = useFileDrop({ disabled, onFiles });
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-label={browseLabel}
        disabled={disabled}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={isMobile ? (mobileLabel ?? browseLabel) : label}
        aria-describedby={
          isMobile
            ? requirements
              ? requirementsId
              : undefined
            : requirements
              ? `${hintId} ${requirementsId}`
              : hintId
        }
        className={cn(
          "relative isolate flex w-full items-center overflow-hidden gap-3 rounded-xl border border-solid bg-control p-4 text-left md:flex-col md:gap-4 md:rounded-dashed-surface md:border-(length:--dashed-surface-border-width) md:border-dashed md:px-6 md:py-10 md:text-center outline-none transition-colors duration-normal ease-standard enabled:hover:border-primary enabled:active:border-primary enabled:active:border-solid focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          dragging ? "border-primary" : "border-border",
        )}
        onClick={() => input.current?.click()}
        {...handlers}
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <UploadIcon aria-hidden="true" className="size-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1 md:contents">
          <span className="text-sm font-semibold md:hidden">
            {mobileLabel ?? browseLabel}
          </span>
          <span className="hidden text-base font-semibold md:block">
            {label}
          </span>
          <span
            id={hintId}
            className="hidden text-sm text-muted-foreground md:block"
          >
            {hint}
          </span>
          <span
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "hidden md:inline-flex",
            )}
          >
            {browseLabel}
          </span>
          {requirements ? (
            <span id={requirementsId} className="text-xs text-muted-foreground">
              {requirements}
            </span>
          ) : null}
        </span>
        {dragging ? (
          <FileDropOverlay
            label={label}
            compact={isMobile}
            className="rounded-[inherit]"
          />
        ) : null}
      </button>
    </>
  );
}
