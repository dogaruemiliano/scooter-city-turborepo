"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v1 } from "@repo/api-shared";
import { webApi } from "@/lib/api";
import { useActivityNotifications } from "@/components/notifications/ActivityNotificationsProvider";

/** One acknowledgement per visit, covering history beyond the loaded pages. */
export function useNotificationsVisit() {
  const markAllRead = useActivityNotifications()?.markAllRead;
  const cutoff = useRef<string | null>(null);
  const running = useRef(false);
  const confirmed = useRef(false);
  const alive = useRef(false);
  const [seenCutoff, setSeenCutoff] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const acknowledge = useCallback(async () => {
    if (running.current || confirmed.current) return;
    running.current = true;
    setPending(true);
    setError(false);
    try {
      if (!cutoff.current) {
        const snapshot = await webApi.fetch(
          `${v1.notifications.ROUTES.list}?limit=1`,
          v1.notifications.notificationListSchema,
          { cache: "no-store" },
        );
        if (!alive.current) return;
        cutoff.current = snapshot.cutoff;
      }
      if (markAllRead) await markAllRead(cutoff.current);
      else
        await webApi.fetch(
          v1.notifications.ROUTES.readAll,
          v1.notifications.notificationMutationResultSchema,
          { method: "POST", json: { cutoff: cutoff.current } },
        );
      confirmed.current = true;
      if (!alive.current) return;
      setSeenCutoff(cutoff.current);
      if (!markAllRead)
        window.dispatchEvent(new CustomEvent("notifications-updated"));
    } catch {
      if (alive.current) setError(true);
    } finally {
      running.current = false;
      if (alive.current) setPending(false);
    }
  }, [markAllRead]);

  useEffect(() => {
    alive.current = true;
    void acknowledge();
    return () => {
      alive.current = false;
    };
  }, [acknowledge]);

  return { seenCutoff, pending, error, retry: acknowledge };
}

export function notificationsAfterVisit(
  list: v1.notifications.NotificationList,
  seenCutoff: string | null,
): v1.notifications.NotificationList {
  if (!seenCutoff) return list;
  const items = list.items.map((item) =>
    !item.readAt && item.createdAt <= seenCutoff
      ? { ...item, readAt: seenCutoff }
      : item,
  );
  return {
    ...list,
    unreadCount: list.cutoff <= seenCutoff ? 0 : list.unreadCount,
    items,
  };
}
