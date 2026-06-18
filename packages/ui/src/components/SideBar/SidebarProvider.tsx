"use client";

import * as React from "react";
import { tokens } from "@repo/theme";

import { useIsMobile } from "@repo/ui/hooks/use-mobile";
import { cn } from "@repo/ui/lib/utils";

import {
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_ICON,
} from "./constants";
import { SidebarContext, type SidebarContextProps } from "./sidebar-context";

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  hoverExpand = true,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hoverExpand?: boolean;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [hoverOpen, setHoverOpen] = React.useState(false);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const hoverOpenTimer = React.useRef<number | null>(null);
  const hoverCloseTimer = React.useRef<number | null>(null);
  const open = openProp ?? uncontrolledOpen;

  const setOpen = React.useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >(
    (value) => {
      const nextOpen = typeof value === "function" ? value(open) : value;

      if (setOpenProp) {
        setOpenProp(nextOpen);
      } else {
        setUncontrolledOpen(nextOpen);
      }

      document.cookie = `${SIDEBAR_COOKIE_NAME}=${nextOpen}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
    },
    [open, setOpenProp],
  );

  const clearHoverTimers = React.useCallback(() => {
    if (hoverOpenTimer.current !== null) {
      window.clearTimeout(hoverOpenTimer.current);
      hoverOpenTimer.current = null;
    }

    if (hoverCloseTimer.current !== null) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }, []);

  const resetHoverPreview = React.useCallback(() => {
    clearHoverTimers();
    setHoverOpen(false);
  }, [clearHoverTimers]);

  const requestHoverOpen = React.useCallback(() => {
    if (!hoverExpand || isMobile || open) {
      return;
    }

    if (hoverCloseTimer.current !== null) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }

    if (hoverOpen || hoverOpenTimer.current !== null) {
      return;
    }

    hoverOpenTimer.current = window.setTimeout(() => {
      hoverOpenTimer.current = null;
      setHoverOpen(true);
    }, tokens.motion.duration.fast);
  }, [hoverExpand, hoverOpen, isMobile, open]);

  const requestHoverClose = React.useCallback(() => {
    if (hoverOpenTimer.current !== null) {
      window.clearTimeout(hoverOpenTimer.current);
      hoverOpenTimer.current = null;
    }

    if (hoverCloseTimer.current !== null) {
      return;
    }

    hoverCloseTimer.current = window.setTimeout(() => {
      hoverCloseTimer.current = null;
      setHoverOpen(false);
    }, tokens.motion.duration.normal);
  }, []);

  React.useEffect(() => clearHoverTimers, [clearHoverTimers]);

  React.useEffect(() => {
    if (!hoverExpand || isMobile || open) {
      resetHoverPreview();
    }
  }, [hoverExpand, isMobile, open, resetHoverPreview]);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((currentOpen) => !currentOpen);
      return;
    }

    resetHoverPreview();
    setOpen(!open);
  }, [isMobile, open, resetHoverPreview, setOpen]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open || hoverOpen ? "expanded" : "collapsed";
  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      hoverOpen,
      hoverExpand,
      requestHoverOpen,
      requestHoverClose,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [
      state,
      open,
      setOpen,
      hoverOpen,
      hoverExpand,
      requestHoverOpen,
      requestHoverClose,
      isMobile,
      openMobile,
      toggleSidebar,
    ],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}
