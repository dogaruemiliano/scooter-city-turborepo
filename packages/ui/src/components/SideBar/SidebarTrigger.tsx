"use client";

import * as React from "react";
import { MenuIcon, PanelLeftIcon } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { useSidebar } from "./sidebar-context";

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { hoverOpen, isMobile, open, openMobile, state, toggleSidebar } =
    useSidebar();
  const expanded = isMobile ? openMobile : state === "expanded";
  const label = isMobile
    ? openMobile
      ? "Close navigation"
      : "Open navigation"
    : open
      ? "Collapse sidebar"
      : hoverOpen
        ? "Pin sidebar open"
        : "Expand sidebar";

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn(className)}
      aria-expanded={expanded}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      {isMobile ? <MenuIcon /> : <PanelLeftIcon />}
      <span className="sr-only">{label}</span>
    </Button>
  );
}
