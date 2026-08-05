import { Loader2Icon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@repo/ui/lib/utils";

type SpinnerProps = ComponentProps<"span"> & {
  label?: string;
};

function Spinner({ className, label, ...props }: SpinnerProps) {
  return (
    <span
      data-slot="spinner"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-flex size-4 animate-spin [animation-duration:var(--duration-countdown-tick)] motion-reduce:animate-none",
        className,
      )}
      {...props}
    >
      <Loader2Icon aria-hidden="true" className="size-full" />
    </span>
  );
}

export { Spinner };
export type { SpinnerProps };
