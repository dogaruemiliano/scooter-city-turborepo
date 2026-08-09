import * as React from "react";

import { Input } from "@repo/ui/components/input";
import { cn } from "@repo/ui/lib/utils";

export function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("h-12 w-full bg-background shadow-none md:h-11", className)}
      {...props}
    />
  );
}
