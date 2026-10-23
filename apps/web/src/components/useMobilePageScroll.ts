"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type UIEvent,
} from "react";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";

/** The app shell persists across routes, including routes that bypass its frame. */
export function useMobilePageScroll(pathname: string, enabled: boolean) {
  const mobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const historyDestination = useRef<string | null>(null);

  useEffect(() => {
    const restore = () => {
      historyDestination.current =
        window.location.pathname !== pathname ? window.location.pathname : null;
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [pathname]);

  useLayoutEffect(() => {
    if (!mobile || !enabled || !ref.current) return;
    ref.current.scrollTop =
      historyDestination.current === pathname
        ? (positions.current.get(pathname) ?? 0)
        : 0;
    historyDestination.current = null;
  }, [pathname, mobile, enabled]);

  const setScrollElement = useCallback((element: HTMLDivElement | null) => {
    ref.current = element;
  }, []);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    if (mobile) positions.current.set(pathname, event.currentTarget.scrollTop);
  };
  return [setScrollElement, onScroll] as const;
}
