import type { ComponentProps, ReactNode } from "react";

import { cn } from "@repo/ui/lib/utils";
import { Card, CardContent } from "./card";

type FormActionsProps = ComponentProps<"div"> & {
  /** Context for the actions, such as validation feedback or a draft status. */
  status?: ReactNode;
  sticky?: boolean;
};

function FormActions({
  className,
  status,
  sticky = false,
  children,
  ...props
}: FormActionsProps) {
  const layout =
    "flex min-w-0 flex-col gap-3 @form-columns/form-actions:flex-row @form-columns/form-actions:items-center @form-columns/form-actions:justify-end";
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
      <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-3 *:min-w-0 *:max-w-full *:flex-1 @form-columns/form-actions:w-auto @form-columns/form-actions:*:flex-none">
        {children}
      </div>
    </>
  );
  if (sticky)
    return (
      <Card
        data-slot="form-actions"
        className={cn(
          "@container/form-actions sticky bottom-[calc(var(--spacing-4)+env(safe-area-inset-bottom))] z-sticky gap-0 py-0 shadow-md sm:bottom-[calc(var(--spacing-8)+env(safe-area-inset-bottom))]",
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
