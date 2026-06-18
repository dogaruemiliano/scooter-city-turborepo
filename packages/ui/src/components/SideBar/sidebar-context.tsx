"use client";

import * as React from "react";

export type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  hoverOpen: boolean;
  hoverExpand: boolean;
  requestHoverOpen: () => void;
  requestHoverClose: () => void;
  openMobile: boolean;
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>;
  isMobile: boolean;
  toggleSidebar: () => void;
};

export const SidebarContext = React.createContext<SidebarContextProps | null>(
  null,
);

export function useSidebar() {
  const context = React.useContext(SidebarContext);

  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}
