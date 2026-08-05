"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type PageHeaderActionsContextValue = {
  isMobile: boolean;
  target: HTMLElement | null;
};

export const PageHeaderActionsContext =
  createContext<PageHeaderActionsContextValue | null>(null);

export function PageHeaderActions({ children }: { children: ReactNode }) {
  const context = useContext(PageHeaderActionsContext);

  if (!context?.isMobile) {
    return children;
  }

  return context.target ? createPortal(children, context.target) : null;
}
