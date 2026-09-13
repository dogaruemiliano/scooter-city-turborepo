import { spacing } from "@repo/theme";
import { cn } from "@repo/ui/lib/utils";

export type ImageRotationAxis = "z" | "x" | "y";

/** Camera-editor symbols: straighten, vertical perspective, horizontal perspective. */
export function ImageRotationIcon({
  axis,
  className,
}: {
  axis: ImageRotationAxis;
  className?: string;
}) {
  return (
    <svg
      data-axis={axis}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={spacing[0.5]}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-6", className)}
    >
      {axis === "z" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M2 12h20" />
        </>
      ) : axis === "x" ? (
        <>
          <path d="M8 4h8l5 16H3Z" />
          <path d="M12 2v20" />
        </>
      ) : (
        <>
          <path d="M20 8v8L4 21V3Z" />
          <path d="M2 12h20" />
        </>
      )}
    </svg>
  );
}
