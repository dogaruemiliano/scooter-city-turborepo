import type { ComponentProps } from "react";
import { spacing } from "@repo/theme";
import { cn } from "@repo/ui/lib/utils";

/** Engine-block symbol, using the same outline treatment as our Lucide icons. */
export function EngineIcon({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={spacing[0.5]}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4", className)}
      {...props}
    >
      <path d="M7 8h8l3 3h3v8h-4l-3 2H8l-3-4V10Z" />
      <path d="M8 4h6M11 4v4M2 11v6M2 14h3M18 11v8" />
    </svg>
  );
}
