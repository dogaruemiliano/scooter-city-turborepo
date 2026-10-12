import type { ComponentProps, ReactNode } from "react";

import { cn } from "@repo/ui/lib/utils";

type FormActionsProps = ComponentProps<"div"> & {
  /** Context for the actions, such as validation feedback or a draft status. */
  status?: ReactNode;
};

function FormActions({
  className,
  status,
  children,
  ...props
}: FormActionsProps) {
  return (
    <div
      data-slot="form-actions"
      className={cn(
        "flex min-w-0 shrink-0 flex-col gap-3 border-t border-border bg-inherit p-4 sm:flex-row sm:items-center sm:justify-end md:px-6",
        className,
      )}
      {...props}
    >
      {status != null ? (
        <div
          role="status"
          className="min-w-0 flex-1 text-xs text-muted-foreground"
        >
          {status}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-3 *:flex-1 sm:*:flex-none">
        {children}
      </div>
    </div>
  );
}

export { FormActions, type FormActionsProps };
