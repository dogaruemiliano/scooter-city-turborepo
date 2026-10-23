"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type PageHeaderActionsContextValue = {
  isMobile: boolean;
  target: HTMLElement | null;
};

export const PageHeaderActionsContext =
  createContext<PageHeaderActionsContextValue | null>(null);

export function PageHeaderActions({
  children,
  desktopTarget,
}: {
  children: ReactNode;
  desktopTarget?: HTMLElement | null;
}) {
  const context = useContext(PageHeaderActionsContext);

  if (!context?.isMobile) {
    return desktopTarget ? createPortal(children, desktopTarget) : children;
  }

  return context.target ? createPortal(children, context.target) : null;
}
