"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import { v1 } from "@repo/api-shared";

interface ReturnState {
  userId: string;
  accessRevision: number;
  href: string;
  top: number;
  list: v1.notifications.NotificationList;
}
const HISTORY_KEY = "notificationsReturn:v2";
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
function notificationScrollport(page: HTMLElement | null) {
  const shell = page?.closest<HTMLElement>('[data-slot="app-page-scroll"]');
  return shell && getComputedStyle(shell).overflowY === "auto" ? shell : null;
}

/** The history entry owns the full feed's loaded pages and scroll position. */
export function useNotificationHistory(userId: string, accessRevision = 0) {
  const pageRef = useRef<HTMLElement>(null);
  const latest = useRef<v1.notifications.NotificationList | null>(null);
  const pendingRestore = useRef<ReturnState | null>(null);
  const frame = useRef<number | null>(null);
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const restored = useMemo(() => {
    if (!ready) return null;
    const saved = window.history.state?.[HISTORY_KEY] as
      | ReturnState
      | undefined;
    const list = v1.notifications.notificationListSchema.safeParse(saved?.list);
    if (
      saved?.userId === userId &&
      saved.accessRevision === accessRevision &&
      saved.href === window.location.href &&
      Number.isFinite(saved.top) &&
      saved.top >= 0 &&
      list.success
    ) {
      return { ...saved, list: list.data };
    }
    return null;
  }, [ready, userId, accessRevision]);

  useLayoutEffect(() => {
    pendingRestore.current = restored;
    latest.current = null;
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [restored]);

  const rememberList = useCallback(
    (list: v1.notifications.NotificationList) => {
      latest.current = list;
      const entry = pendingRestore.current;
      if (!entry) return;
      pendingRestore.current = null;
      frame.current = requestAnimationFrame(() => {
        const container = notificationScrollport(pageRef.current);
        if (container) container.scrollTop = entry.top;
        else window.scrollTo({ top: entry.top, behavior: "instant" });
      });
    },
    [],
  );

  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !latest.current
    )
      return;
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      "a[href]",
    );
    if (
      !link?.closest("[data-notification-id]") ||
      link.hasAttribute("download") ||
      (link.target && link.target !== "_self") ||
      link.origin !== window.location.origin ||
      link.pathname === window.location.pathname
    )
      return;
    const container = notificationScrollport(pageRef.current);
    const entry: ReturnState = {
      list: latest.current,
      userId,
      accessRevision,
      href: window.location.href,
      top: container ? container.scrollTop : window.scrollY,
    };
    window.history.replaceState(
      { ...window.history.state, [HISTORY_KEY]: entry },
      "",
    );
  }
  return { pageRef, ready, restored, rememberList, onClickCapture };
}
