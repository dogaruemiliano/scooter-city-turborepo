"use client";

import * as React from "react";
import { tokens } from "@repo/theme";

const MOBILE_BREAKPOINT = tokens.breakpoints.md;
const getServerSnapshot = () => false;

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT) {
  const query = `(width < ${breakpoint}px)`;
  const getSnapshot = React.useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", onChange);
      // History/document restoration can resume a different viewport without
      // delivering a media-query change event to the suspended document.
      window.addEventListener("popstate", onChange);
      window.addEventListener("pageshow", onChange);
      window.addEventListener("resize", onChange);
      return () => {
        mediaQuery.removeEventListener("change", onChange);
        window.removeEventListener("popstate", onChange);
        window.removeEventListener("pageshow", onChange);
        window.removeEventListener("resize", onChange);
      };
    },
    [query],
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
