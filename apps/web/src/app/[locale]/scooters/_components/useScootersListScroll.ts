"use client";

import { useLayoutEffect, useRef, type MouseEvent } from "react";
import type { v1 } from "@repo/api-shared";

const HISTORY_KEY = "scootersListReturn";

interface ListReturnState {
  href: string;
  top: number;
  list: v1.scooters.ScooterList;
  query: v1.scooters.ListScootersQuery;
}

function scrollContainer(page: HTMLElement | null) {
  const shell = page?.closest<HTMLElement>('[data-slot="app-page-scroll"]');
  // Mobile scrolls inside the shell; desktop scrolls the document.
  return shell && getComputedStyle(shell).overflowY === "auto" ? shell : null;
}

/** Keep the loaded rows and Y position on the history entry we return to. */
export function useScootersListScroll(
  list: v1.scooters.ScooterList,
  query: v1.scooters.ListScootersQuery,
  restoreList: (
    list: v1.scooters.ScooterList,
    query: v1.scooters.ListScootersQuery,
  ) => void,
) {
  const pageRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const saved = window.history.state?.[HISTORY_KEY] as
      | ListReturnState
      | undefined;
    if (!saved || saved.href !== window.location.href) return;

    restoreList(saved.list, saved.query);
    // Wait for the restored rows and the shell's route scroll reset to commit.
    const frame = window.requestAnimationFrame(() => {
      const container = scrollContainer(pageRef.current);
      if (container) container.scrollTop = saved.top;
      else window.scrollTo({ top: saved.top, behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [restoreList]);

  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const link = (event.target as Element).closest<HTMLAnchorElement>(
      "a[href]",
    );
    if (
      !link ||
      link.hasAttribute("download") ||
      (link.target && link.target !== "_self") ||
      link.origin !== window.location.origin ||
      link.pathname === window.location.pathname
    ) {
      return;
    }

    const container = scrollContainer(pageRef.current);
    const saved: ListReturnState = {
      href: window.location.href,
      top: container ? container.scrollTop : window.scrollY,
      list,
      query,
    };
    // Preserve Next's router state and any other history-entry metadata.
    window.history.replaceState(
      { ...window.history.state, [HISTORY_KEY]: saved },
      "",
    );
  }

  return { pageRef, onClickCapture };
}
