import * as React from "react";

import { cn } from "@repo/ui/lib/utils";
import { Card, CardHeader, CardContent } from "./card";

/**
 * Groups related fields inside a full-page form.
 *
 * Uses the page surface by default. `panel` adds the shared card surface;
 * `columns={1}` keeps fields legible in narrow review panels at every viewport.
 *
 * Omit `title` for a single-field section: a heading above one labelled input
 * reads as redundant. The section still supplies the grid and spacing.
 */
function FormSection({
  title,
  number,
  status,
  panel = false,
  columns = 2,
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & {
  title?: string;
  number?: number;
  status?: React.ReactNode;
  panel?: boolean;
  columns?: 1 | 2;
}) {
  const fieldsClassName = cn(
    "grid min-w-0 grid-cols-1 gap-4 [&>*]:min-w-0",
    columns === 2
      ? "@form-columns/form-section:grid-cols-2 @max-form-columns/form-section:[&>*]:col-span-full!"
      : "[&>*]:col-span-full!",
  );
  const heading = title ? (
    <h2 className="flex min-w-0 items-center gap-3 text-base font-semibold normal-case tracking-normal wrap-anywhere">
      <span
        aria-hidden="true"
        className="h-5 w-1 shrink-0 rounded-full bg-foreground"
      />
      {number != null ? `${String(number).padStart(2, "0")}. ` : ""}
      {title}
    </h2>
  ) : null;
  if (panel)
    return (
      <Card
        as="section"
        data-slot="form-section"
        className={cn("@container/form-section", className)}
        {...props}
      >
        <CardHeader>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            {heading}
            {status}
          </div>
        </CardHeader>
        <CardContent className={fieldsClassName}>{children}</CardContent>
      </Card>
    );
  return (
    <section
      data-slot="form-section"
      className={cn("@container/form-section grid min-w-0 gap-4", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        {heading}
        {status}
      </div>
      <div className={fieldsClassName}>{children}</div>
    </section>
  );
}

export { FormSection };
