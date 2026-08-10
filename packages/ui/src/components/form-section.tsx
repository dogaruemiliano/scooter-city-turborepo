import * as React from "react";

import { cn } from "@repo/ui/lib/utils";

/**
 * Groups related fields inside a full-page form.
 *
 * Deliberately chrome-free — no background, border, radius or horizontal
 * padding — so form fields use the full width of the page container. Sections
 * are separated by their heading and the gap of the surrounding form.
 *
 * Omit `title` for a single-field section: a heading above one labelled input
 * reads as redundant. The section still supplies the grid and spacing.
 */
function FormSection({
  title,
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & { title?: string }) {
  return (
    <section
      data-slot="form-section"
      className={cn("grid min-w-0 gap-4", className)}
      {...props}
    >
      {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export { FormSection };
