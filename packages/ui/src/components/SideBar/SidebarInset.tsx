import * as React from "react";

import { cn } from "@repo/ui/lib/utils";

export function SidebarInset<Element extends "main" | "div" = "main">({
  as,
  className,
  ...props
}: Omit<React.ComponentProps<Element>, "as"> & {
  /** Let the page provide its own main landmark inside the app shell. */
  as?: Element;
}) {
  return React.createElement(as ?? "main", {
    "data-slot": "sidebar-inset",
    className: cn(
      "relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
      className,
    ),
    ...props,
  });
}
