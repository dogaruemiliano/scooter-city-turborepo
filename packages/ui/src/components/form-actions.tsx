import type { ComponentProps, ReactNode } from "react";

import { cn } from "@repo/ui/lib/utils";
import { Card, CardContent } from "./card";

type FormActionsProps = ComponentProps<"div"> & {
  /** Context for the actions, such as validation feedback or a draft status. */
  status?: ReactNode;
  /** Cancel or Back. Page action bars show this only on desktop; mobile uses the header. */
  secondaryAction?: ReactNode;
  buttonLayout?: "equal" | "primary";
  sticky?: boolean;
  /** Compact padding and action spacing for short floating save bars. */
  density?: "default" | "compact";
  /** Page forms: reveal the floating actions when submission is valid. */
  ready?: boolean;
  /** Keeps ready actions visible while submission is in progress. */
  pending?: boolean;
  /** Contained footers: confirm first on mobile, cancel left on desktop. Page bars always use one row. */
  arrangement?: "default" | "split";
};

function FormActions({
  className,
  status,
  secondaryAction,
  buttonLayout = "equal",
  sticky = false,
  density = "default",
  ready,
  pending = false,
  arrangement = "default",
  children,
  ...props
}: FormActionsProps) {
  const pageActions = sticky || ready !== undefined;
  // Split actions occupy the full row. Keep status above them so it cannot
  // shrink to a column of single characters beside a full-width button group.
  const layout =
    pageActions || arrangement === "split"
      ? "flex min-w-0 flex-col gap-3"
      : "flex min-w-0 flex-col gap-3 @form-columns/form-actions:flex-row @form-columns/form-actions:items-center @form-columns/form-actions:justify-end";
  const secondary =
    secondaryAction != null ? (
      <div
        data-slot="form-actions-secondary"
        className={
          pageActions
            ? "hidden md:mr-auto md:flex md:items-center md:gap-3"
            : "contents"
        }
      >
        {secondaryAction}
      </div>
    ) : null;
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
          pageActions
            ? "flex w-full min-w-0 items-center justify-end gap-3 *:min-w-0 *:max-w-full *:flex-1 md:*:flex-initial"
            : arrangement === "split"
              ? "flex w-full min-w-0 flex-col *:min-w-0 *:max-w-full md:flex-row-reverse md:items-center md:justify-between"
              : buttonLayout === "primary"
                ? "grid w-full min-w-0 grid-cols-(--container-primary-form-actions) items-center gap-3 *:min-w-0 *:max-w-full *:w-full"
                : "flex w-full min-w-0 flex-wrap items-center justify-end gap-3 *:min-w-0 *:max-w-full *:flex-1 @form-columns/form-actions:w-auto @form-columns/form-actions:*:flex-none",
          !pageActions &&
            arrangement === "split" &&
            (density === "compact" ? "gap-2" : "gap-6"),
        )}
      >
        {pageActions || arrangement !== "split" ? secondary : null}
        {children}
        {!pageActions && arrangement === "split" ? secondary : null}
      </div>
    </>
  );
  const floating = ready === undefined ? sticky : ready || pending;
  // Keep the normal edge gap or the device safe area, without adding both.
  if (sticky || ready !== undefined)
    return (
      <Card
        data-slot="form-actions"
        data-sticky={floating}
        aria-busy={pending || undefined}
        className={cn(
          "@container/form-actions sticky bottom-[max(var(--spacing-4),env(safe-area-inset-bottom))] z-sticky gap-0 py-0 shadow-md group-data-[keyboard-open=true]/keyboard-aware:static",
          ready !== undefined && "w-full",
          ready !== undefined &&
            (floating
              ? "self-end bg-floating-action-surface backdrop-blur-floating-surface animate-in slide-in-from-bottom-4 duration-normal ease-decelerate motion-reduce:animate-none"
              : "static bottom-auto"),
          className,
        )}
        {...props}
      >
        <CardContent
          className={cn(
            layout,
            density === "compact" ? "p-3 sm:p-4" : "p-4 sm:p-6",
          )}
        >
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
