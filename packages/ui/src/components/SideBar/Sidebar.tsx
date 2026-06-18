"use client";

import * as React from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { cn } from "@repo/ui/lib/utils";

import { SIDEBAR_WIDTH_MOBILE } from "./constants";
import { useSidebar } from "./sidebar-context";

export function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  dir,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}) {
  const {
    isMobile,
    state,
    open,
    hoverOpen,
    requestHoverOpen,
    requestHoverClose,
    openMobile,
    setOpenMobile,
  } = useSidebar();
  const isEffectivelyCollapsed = state === "collapsed";
  const sidebarContainerWidth =
    isEffectivelyCollapsed && collapsible === "icon"
      ? variant === "floating" || variant === "inset"
        ? "w-[calc(var(--sidebar-width-icon)+var(--spacing-4)+var(--spacing-0-5))]"
        : "w-(--sidebar-width-icon)"
      : "w-(--sidebar-width)";

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          dir={dir}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={open ? "expanded" : "collapsed"}
      data-hover-open={hoverOpen ? "" : undefined}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
      onPointerEnter={(event) => {
        if (collapsible === "icon" && event.pointerType === "mouse") {
          requestHoverOpen();
        }
      }}
      onPointerLeave={(event) => {
        if (collapsible === "icon" && event.pointerType === "mouse") {
          requestHoverClose();
        }
      }}
    >
      <div
        data-collapsible={open ? "" : collapsible}
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-normal ease-linear",
          "data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+var(--spacing-4))]"
            : "data-[collapsible=icon]:w-(--sidebar-width-icon)",
        )}
      />
      <div
        data-slot="sidebar-container"
        data-side={side}
        className={cn(
          "fixed inset-y-0 z-navigation hidden h-svh transition-[left,right,width] duration-normal ease-linear data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex",
          sidebarContainerWidth,
          variant === "floating" || variant === "inset"
            ? "p-2"
            : "group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className,
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
