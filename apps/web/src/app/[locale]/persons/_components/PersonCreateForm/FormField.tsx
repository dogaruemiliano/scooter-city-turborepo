import { Label } from "@repo/ui/components";
import { cloneElement, isValidElement, type ReactNode } from "react";
import {
  extractionFieldNeedsReview,
  type ExtractionFieldKey,
} from "./extraction-state";
import { useExtractionReview } from "./ExtractionReviewContext";
import { FieldExtractionHint } from "./FieldExtractionHint";
import { FieldExtractionLoading } from "./FieldExtractionLoading";

export function FormField({
  id,
  label,
  required = false,
  disabled = false,
  error,
  className,
  children,
  extractionKey,
}: {
  id: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
  extractionKey?: ExtractionFieldKey;
}) {
  const extraction = useExtractionReview();
  const needsReview = Boolean(
    !disabled &&
    extractionKey &&
    extraction &&
    extractionFieldNeedsReview(extraction.state, extractionKey),
  );
  const control =
    needsReview && isValidElement<Record<string, unknown>>(children)
      ? cloneElement(children, {
          ["describedById" in children.props
            ? "describedById"
            : "aria-describedby"]: [
            children.props.describedById ?? children.props["aria-describedby"],
            `${id}-extraction-hint`,
          ]
            .filter(Boolean)
            .join(" "),
        })
      : children;
  return (
    <div
      data-extraction-review={needsReview || undefined}
      data-disabled={disabled || undefined}
      className={[
        "flex min-w-0 flex-col gap-2",
        needsReview
          ? "[&_input]:border-warning [&_input]:bg-warning-subtle [&_button[aria-haspopup]]:border-warning [&_button[aria-haspopup]]:bg-warning-subtle"
          : undefined,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={[
          "flex items-center gap-1",
          disabled ? "text-disabled-foreground" : undefined,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Label id={`${id}-label`} htmlFor={id}>
          {label}
        </Label>
        {required ? (
          <span aria-hidden="true" className="text-current">
            *
          </span>
        ) : null}
        {extractionKey && !disabled ? (
          <FieldExtractionLoading fieldKey={extractionKey} label={label} />
        ) : null}
      </div>
      {control}
      {extractionKey && !disabled ? (
        <FieldExtractionHint
          id={`${id}-extraction-hint`}
          fieldKey={extractionKey}
        />
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
