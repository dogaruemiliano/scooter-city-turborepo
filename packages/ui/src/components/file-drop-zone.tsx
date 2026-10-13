"use client";

import { useId, useRef } from "react";
import { UploadIcon } from "lucide-react";
import { buttonVariants } from "./button";
import { FileDropOverlay } from "./file-drop-overlay";
import { useFileDrop } from "../hooks/use-file-drop";
import { cn } from "../lib/utils";

/** File acquisition only. The feature owns limits, uploads and error handling. */
export function FileDropZone({
  label,
  browseLabel,
  hint,
  requirements,
  accept,
  disabled,
  onFiles,
}: {
  label: string;
  browseLabel: string;
  hint: string;
  requirements?: string;
  accept: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
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
        aria-label={label}
        aria-describedby={requirements ? `${hintId} ${requirementsId}` : hintId}
        className={cn(
          "relative flex w-full flex-col items-center gap-4 rounded-2xl border-2 border-dashed bg-control px-6 py-10 text-center outline-none transition-colors duration-normal ease-standard enabled:hover:border-primary enabled:active:border-primary enabled:active:border-solid focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          dragging ? "border-primary" : "border-border",
        )}
        onClick={() => input.current?.click()}
        {...handlers}
      >
        <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <UploadIcon aria-hidden="true" className="size-6" />
        </span>
        <span className="text-base font-semibold">{label}</span>
        <span id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </span>
        <span
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          {browseLabel}
        </span>
        {requirements ? (
          <span id={requirementsId} className="text-xs text-muted-foreground">
            {requirements}
          </span>
        ) : null}
        {dragging ? (
          <FileDropOverlay label={label} className="rounded-2xl" />
        ) : null}
      </button>
    </>
  );
}
