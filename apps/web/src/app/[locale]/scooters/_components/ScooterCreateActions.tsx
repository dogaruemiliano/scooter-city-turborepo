"use client";

import { type ReactNode } from "react";
import { Button, FormActions } from "@repo/ui/components";

/** A direct child of the form so native bottom-sticky positioning can span the entire form. */
export function ScooterCreateActions({
  enabled = true,
  ready,
  pending = false,
  submitting = false,
  status,
  review,
  children,
}: {
  enabled?: boolean;
  ready: boolean;
  pending?: boolean;
  submitting?: boolean;
  status: ReactNode;
  review?: { label: string; onClick: () => void; disabled?: boolean };
  children: ReactNode;
}) {
  if (!enabled) return <FormActions status={status}>{children}</FormActions>;
  const readyToAct = !pending && (ready || Boolean(review));

  return (
    <FormActions
      ready={readyToAct}
      pending={submitting}
      status={status}
      data-slot="create-actions"
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
