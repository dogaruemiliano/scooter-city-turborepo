import * as React from "react";

import { cn } from "@repo/ui/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-base transition-colors duration-fast ease-standard outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
