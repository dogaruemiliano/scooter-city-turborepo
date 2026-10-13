"use client";

import { useId, useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { buttonVariants } from "./button";
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
  const [dragging, setDragging] = useState(false);
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
        aria-describedby={requirements ? `${hintId} ${requirementsId}` : hintId}
        className={cn(
          "flex w-full flex-col items-center gap-4 rounded-2xl border-2 border-dashed bg-control px-6 py-10 text-center outline-none transition-colors duration-fast ease-standard hover:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          dragging ? "border-primary" : "border-border",
        )}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) onFiles(Array.from(event.dataTransfer.files));
        }}
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
      </button>
    </>
  );
}
