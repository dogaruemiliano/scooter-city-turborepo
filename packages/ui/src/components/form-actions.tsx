import type { ComponentProps, ReactNode } from "react";

import { cn } from "@repo/ui/lib/utils";
import { Card, CardContent } from "./card";

type FormActionsProps = ComponentProps<"div"> & {
  /** Context for the actions, such as validation feedback or a draft status. */
  status?: ReactNode;
  buttonLayout?: "equal" | "primary";
  sticky?: boolean;
  /** Page forms: reveal the floating actions when submission is valid. */
  ready?: boolean;
  /** Keeps ready actions visible while submission is in progress. */
  pending?: boolean;
  /** Confirm first on mobile; cancel left and confirm right on desktop. Put confirm first in children. */
  arrangement?: "default" | "split";
};

function FormActions({
  className,
  status,
  buttonLayout = "equal",
  sticky = false,
  ready,
  pending = false,
  arrangement = "default",
  children,
  ...props
}: FormActionsProps) {
  // Split actions occupy the full row. Keep status above them so it cannot
  // shrink to a column of single characters beside a full-width button group.
  const layout =
    arrangement === "split"
      ? "flex min-w-0 flex-col gap-3"
      : "flex min-w-0 flex-col gap-3 @form-columns/form-actions:flex-row @form-columns/form-actions:items-center @form-columns/form-actions:justify-end";
  const content = (
    <>
      {status != null ? (
        <div
          role="status"
          className="min-w-0 flex-1 text-xs text-muted-foreground wrap-anywhere"
        >
          {status}
        </div>
      ) : null}
      <div
        className={cn(
          arrangement === "split"
            ? "flex w-full min-w-0 flex-col gap-6 *:min-w-0 *:max-w-full md:flex-row-reverse md:items-center md:justify-between"
            : buttonLayout === "primary"
              ? "grid w-full min-w-0 grid-cols-(--container-primary-form-actions) items-center gap-3 *:min-w-0 *:max-w-full *:w-full"
              : "flex w-full min-w-0 flex-wrap items-center justify-end gap-3 *:min-w-0 *:max-w-full *:flex-1 @form-columns/form-actions:w-auto @form-columns/form-actions:*:flex-none",
        )}
      >
        {children}
      </div>
    </>
  );
  const floating = ready === undefined ? sticky : ready || pending;
  if (sticky || ready !== undefined)
    return (
      <Card
        data-slot="form-actions"
        data-sticky={floating}
        aria-busy={pending || undefined}
        className={cn(
          "@container/form-actions sticky bottom-[calc(var(--spacing-4)+env(safe-area-inset-bottom))] z-sticky gap-0 py-0 shadow-md sm:bottom-[calc(var(--spacing-8)+env(safe-area-inset-bottom))]",
          ready !== undefined && "w-full",
          ready !== undefined &&
            (floating
              ? "self-end bg-floating-action-surface backdrop-blur-floating-surface animate-in slide-in-from-bottom-4 duration-normal ease-decelerate motion-reduce:animate-none"
              : "static bottom-auto sm:bottom-auto"),
          className,
        )}
        {...props}
      >
        <CardContent className={cn(layout, "p-4 sm:p-6")}>
          {content}
        </CardContent>
      </Card>
    );
  return (
    <div
      data-slot="form-actions"
      aria-busy={pending || undefined}
      className={cn(
        "@container/form-actions shrink-0 border-t border-border bg-inherit p-4 md:px-6",
        className,
      )}
      {...props}
    >
      <div className={layout}>{content}</div>
    </div>
  );
}

export { FormActions, type FormActionsProps };
