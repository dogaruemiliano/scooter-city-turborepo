import { createElement, type ComponentProps } from "react";

import { cn } from "@repo/ui/lib/utils";

export type PageLayoutProps<Element extends "main" | "div" = "main"> = Omit<
  ComponentProps<Element>,
  "as"
> & {
  /** Use div when another layout already provides the main landmark. */
  as?: Element;
  width?: "standard" | "form" | "full";
  /** Wizards and edge-to-edge editors own their inner gutters. */
  paddingX?: "default" | "none";
  /** Compact preserves the smaller mobile inset used by step-based forms. */
  paddingTop?: "default" | "compact" | "none";
};

/**
 * The shared page content boundary inside the app shell. Render exactly once
 * per page, either in its route layout or its screen component. It deliberately
 * leaves scrolling, bottom safe areas, and sticky offsets to the app shell.
 *
 * --page-gutter is available even with paddingX="none", so embedded controls
 * such as WizardForm can align their own content with ordinary pages.
 */
export function PageLayout<Element extends "main" | "div" = "main">({
  as,
  width = "standard",
  paddingX = "default",
  paddingTop = "default",
  className,
  ...props
}: PageLayoutProps<Element>) {
  return createElement(as ?? "main", {
    ...props,
    "data-slot": "page-layout",
    "data-width": width,
    "data-padding-x": paddingX,
    "data-padding-top": paddingTop,
    className: cn(
      "[--page-gutter:var(--spacing-4)] sm:[--page-gutter:var(--spacing-6)] lg:[--page-gutter:var(--spacing-8)] mx-auto flex w-full min-w-0 flex-1 flex-col gap-6",
      width === "standard" && "max-w-(--breakpoint-xl)",
      width === "form" && "max-w-(--breakpoint-lg)",
      width === "full" && "max-w-none",
      paddingX === "default" && "px-(--page-gutter)",
      paddingTop === "default" && "pt-6 md:pt-8",
      paddingTop === "compact" && "pt-2 md:pt-8",
      className,
    ),
  });
}
