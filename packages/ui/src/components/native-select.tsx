"use client";

import type * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@repo/ui/lib/utils";

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "default" | "sm";
  wrapperClassName?: string;
};

/** Native selection behavior, with the same surface and states as other inputs. */
function NativeSelect({
  className,
  wrapperClassName,
  size = "default",
  ...props
}: NativeSelectProps) {
  return (
    <div
      data-slot="native-select-wrapper"
      className={cn("relative w-full min-w-0", wrapperClassName)}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "w-full min-w-0 appearance-none rounded-lg border border-input bg-control py-2 pl-3 pr-10 text-foreground transition-colors duration-fast ease-standard outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive",
          size === "sm"
            ? "h-11 rounded-md pl-2 pr-6 text-xs lg:pl-3 lg:pr-8 lg:text-sm"
            : "h-12 text-base md:h-11 md:text-sm",
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
          size === "sm" ? "right-2 lg:right-3" : "right-3",
        )}
      />
    </div>
  );
}

export { NativeSelect, type NativeSelectProps };
