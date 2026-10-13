"use client";

import { type ReactNode } from "react";
import { Button, FormActions } from "@repo/ui/components";

/** A direct child of the form so native bottom-sticky positioning can span the entire form. */
export function ScooterCreateActions({
  enabled = true,
  ready,
  status,
  review,
  children,
}: {
  enabled?: boolean;
  ready: boolean;
  status: ReactNode;
  review?: { label: string; onClick: () => void; disabled?: boolean };
  children: ReactNode;
}) {
  if (!enabled) return <FormActions status={status}>{children}</FormActions>;

  return (
    <FormActions
      sticky
      status={status}
      className={
        ready
          ? "self-end bg-floating-action-surface backdrop-blur-floating-surface"
          : "static bottom-auto sm:bottom-auto"
      }
      data-slot="create-actions"
      data-sticky={ready}
    >
      {review ? (
        <Button
          type="button"
          className="bg-warning text-warning-foreground hover:bg-warning-hover active:bg-warning-active"
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
