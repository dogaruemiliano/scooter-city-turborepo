"use client";

import { type ReactNode } from "react";
import { Button, FormActions } from "@repo/ui/components";

/** A direct child of the form so native bottom-sticky positioning can span the entire form. */
export function ScooterCreateActions({
  enabled = true,
  ready,
  pending = false,
  status,
  review,
  children,
}: {
  enabled?: boolean;
  ready: boolean;
  pending?: boolean;
  status: ReactNode;
  review?: { label: string; onClick: () => void; disabled?: boolean };
  children: ReactNode;
}) {
  if (!enabled) return <FormActions status={status}>{children}</FormActions>;
  const floating = !pending && (ready || Boolean(review));

  return (
    <FormActions
      sticky
      status={status}
      className={
        floating
          ? `self-end bg-floating-action-surface backdrop-blur-floating-surface ${review ? "animate-in slide-in-from-bottom-4 duration-normal motion-reduce:animate-none" : ""}`
          : "static bottom-auto sm:bottom-auto"
      }
      data-slot="create-actions"
      data-sticky={floating}
    >
      {review && !pending ? (
        <Button
          type="button"
          variant="warning"
          disabled={review.disabled}
          onClick={review.onClick}
        >
          {review.label}
        </Button>
      ) : (
        children
      )}
    </FormActions>
  );
}
