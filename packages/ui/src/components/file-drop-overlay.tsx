"use client";

import type { ReactNode } from "react";
import { UploadIcon } from "lucide-react";
import { cn } from "../lib/utils";

/** Shared translucent file-upload state for galleries and document acquisition. */
export function FileDropOverlay({
  label,
  icon,
  className,
  compact = false,
}: {
  label: string;
  icon?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      role="status"
      data-slot="file-drop-overlay"
      className={cn(
        "pointer-events-none absolute inset-0 z-raised flex items-center justify-center rounded-dashed-surface border-(length:--dashed-surface-border-width) border-dashed border-primary bg-file-drop-overlay p-4 text-center backdrop-blur-file-drop",
        compact && "p-1",
        className,
      )}
    >
      <span
        className={cn(
          "flex min-w-0 max-w-full flex-col items-center gap-3 rounded-xl bg-document-overlay p-4 text-foreground",
          compact && "flex-row gap-2 p-2",
        )}
      >
        {icon ?? (
          <UploadIcon
            aria-hidden="true"
            className={compact ? "size-4" : "size-8"}
          />
        )}
        <span
          className={cn(
            "min-w-0 text-lg font-semibold wrap-anywhere",
            compact && "text-sm",
          )}
        >
          {label}
        </span>
      </span>
    </span>
  );
}
