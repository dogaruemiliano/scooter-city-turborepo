"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { v1 } from "@repo/api-shared";
import { formatNotificationMessage, type SupportedLocale } from "@repo/i18n";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import { useOptionalSession } from "@/components/auth/SessionProvider";
import { useWorkspaceNotifications } from "@/components/WorkspaceNotifications";
import { localizePath } from "@/i18n/paths";
import { NotificationChanges } from "./NotificationItem";
import {
  clearPushForOtherAccount,
  synchronizePushSubscription,
} from "./push-client";

const FOREGROUND_POLL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;

interface NotificationContextValue {
  recent: v1.notifications.Notification[];
  unreadCount: number;
  error: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: (cutoff: string) => Promise<void>;
}
const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);
export const useActivityNotifications = () => useContext(NotificationContext);

export function appIsForeground(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

export function ActivityNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const session = useOptionalSession();
  const user = session?.user;
  const userId = user?.id;
  // Account ownership must be reconciled even when the new account has no
  // notification capability (for example, switching from Admin to Client).
  // A temporarily missing hydrated session is not a logout signal.
  useEffect(() => {
    if (userId) void clearPushForOtherAccount(userId).catch(() => {});
  }, [userId]);
  if (!user || !canAccess(user, "notifications.receive")) return children;
  return (
    <NotificationSession
      key={`${user.id}:${user.accessRevision ?? 0}`}
      userId={user.id}
    >
      {children}
    </NotificationSession>
  );
}

function NotificationSession({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string;
}) {
  const [recent, setRecent] = useState<v1.notifications.Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState(false);
  const locale = useLocale() as SupportedLocale;
  const t = useTranslations("notifications");
  const router = useRouter();
  const toast = useWorkspaceNotifications();
  const toastRef = useRef(toast);
  const alive = useRef(true);
  const displayed = useRef(new Set<string>());
  const pendingReceipts = useRef(new Set<string>());
  const ownedToasts = useRef(new Set<string>());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const unreadRef = useRef<number | null>(null);
  const recentRef = useRef<v1.notifications.Notification[] | null>(null);
  const readVersion = useRef(0);
  const refreshVersion = useRef(0);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const refresh = useCallback(async () => {
    const version = readVersion.current;
    const request = ++refreshVersion.current;
    const result = await webApi.fetch(
      `${v1.notifications.ROUTES.list}?limit=5`,
      v1.notifications.notificationListSchema,
      { cache: "no-store" },
    );
    if (
      !alive.current ||
      version !== readVersion.current ||
      request !== refreshVersion.current
    )
      return;
    setRecent(result.items);
    setUnreadCount(result.unreadCount);
    const previous = recentRef.current;
    const newHead =
      previous !== null &&
      result.items.some(
        (item) =>
          !previous.some((known) => known.id === item.id) &&
          (!previous.length || item.createdAt >= previous[0]!.createdAt),
      );
    if (
      unreadRef.current !== null &&
      (unreadRef.current !== result.unreadCount || newHead)
    ) {
      window.dispatchEvent(new CustomEvent("notifications-updated"));
    }
    unreadRef.current = result.unreadCount;
    recentRef.current = result.items;
    setError(false);
  }, []);

  const notifyReadChange = useCallback(() => {
    channelRef.current?.postMessage({ type: "read-changed", userId });
    window.dispatchEvent(new CustomEvent("notifications-updated"));
  }, [userId]);

  const markRead = useCallback(
    async (id: string) => {
      await webApi.fetch(
        v1.notifications.ROUTES.read(id),
        v1.notifications.notificationMutationResultSchema,
        { method: "PATCH", json: {} },
      );
      readVersion.current += 1;
      if (!alive.current) return;
      await refresh();
      notifyReadChange();
    },
    [refresh, notifyReadChange],
  );

  const markAllRead = useCallback(
    async (cutoff: string) => {
      await webApi.fetch(
        v1.notifications.ROUTES.readAll,
        v1.notifications.notificationMutationResultSchema,
        { method: "POST", json: { cutoff } },
      );
      readVersion.current += 1;
      if (!alive.current) return;
      await refresh();
      notifyReadChange();
    },
    [refresh, notifyReadChange],
  );

  const acknowledge = useCallback((id: string) => {
    if (alive.current && appIsForeground()) pendingReceipts.current.add(id);
  }, []);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    let polling = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    void synchronizePushSubscription(userId, locale).catch(() => {});
    const displayedForSession = displayed.current;
    const receiptsForSession = pendingReceipts.current;
    const toastIds = ownedToasts.current;
    if (typeof BroadcastChannel !== "undefined") {
      channelRef.current = new BroadcastChannel(
        `scooter-notifications:${userId}`,
      );
      channelRef.current.onmessage = () => {
        if (appIsForeground()) void refresh().catch(() => {});
        window.dispatchEvent(new CustomEvent("notifications-updated"));
      };
    }
    const flushReceipts = async () => {
      if (!receiptsForSession.size || !appIsForeground()) return;
      const ids = [...receiptsForSession];
      await webApi.fetch(
        v1.notifications.ROUTES.presented,
        v1.notifications.notificationMutationResultSchema,
        { method: "POST", json: { ids }, signal: controller.signal },
      );
      for (const id of ids) receiptsForSession.delete(id);
    };
    async function poll() {
      if (cancelled || polling) return;
      clearTimeout(timer);
      if (!appIsForeground()) return;
      polling = true;
      try {
        await flushReceipts();
        const version = readVersion.current;
        const result = await webApi.fetch(
          `${v1.notifications.ROUTES.list}?pending=true&limit=10`,
          v1.notifications.notificationListSchema,
          { cache: "no-store", signal: controller.signal },
        );
        if (cancelled || !appIsForeground()) return;
        if (version !== readVersion.current) {
          await refresh();
          return;
        }
        setUnreadCount(result.unreadCount);
        setError(false);
        const currentToast = toastRef.current;
        if (currentToast) {
          for (const item of result.items) {
            if (displayedForSession.has(item.id)) continue;
            const id = `activity:${userId}:${item.id}`;
            displayedForSession.add(item.id);
            toastIds.add(id);
            currentToast.add({
              id,
              variant: "info",
              title: formatNotificationMessage(locale, item).body,
              description: (
                <PresentedAlert notification={item} onPresented={acknowledge} />
              ),
              actionProps: {
                children: t("open"),
                onClick: () => {
                  currentToast.dismiss(id);
                  router.push(
                    `${localizePath("/notifications", locale)}?open=${encodeURIComponent(item.id)}`,
                  );
                },
              },
            });
          }
        }
        failures = 0;
        await refresh();
      } catch {
        if (!cancelled) {
          failures += 1;
          setError(true);
        }
      } finally {
        polling = false;
        if (!cancelled && appIsForeground())
          timer = setTimeout(
            poll,
            Math.min(MAX_BACKOFF_MS, FOREGROUND_POLL_MS * 2 ** failures),
          );
      }
    }
    const onForeground = () => {
      if (appIsForeground()) void poll();
      else clearTimeout(timer);
    };
    void poll();
    window.addEventListener("focus", onForeground);
    window.addEventListener("online", onForeground);
    document.addEventListener("visibilitychange", onForeground);
    return () => {
      cancelled = true;
      alive.current = false;
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("focus", onForeground);
      window.removeEventListener("online", onForeground);
      document.removeEventListener("visibilitychange", onForeground);
      channelRef.current?.close();
      channelRef.current = null;
      for (const id of toastIds) toastRef.current?.dismiss(id);
    };
  }, [userId, locale, refresh, acknowledge, t, router]);

  const value = useMemo(
    () => ({ recent, unreadCount, error, refresh, markRead, markAllRead }),
    [recent, unreadCount, error, refresh, markRead, markAllRead],
  );
  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/** Mounts inside the shared toast only after the actual alert is rendered. */
function PresentedAlert({
  notification,
  onPresented,
}: {
  notification: v1.notifications.Notification;
  onPresented: (id: string) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    let presented = false;
    const root = ref.current?.closest('[data-slot="toast"]');
    function checkPresentation() {
      if (
        presented ||
        !root ||
        root.hasAttribute("data-limited") ||
        !appIsForeground()
      )
        return;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          if (!root?.hasAttribute("data-limited") && appIsForeground()) {
            presented = true;
            onPresented(notification.id);
          }
        });
      });
    }
    const observer = new MutationObserver(checkPresentation);
    if (root)
      observer.observe(root, {
        attributes: true,
        attributeFilter: ["data-limited"],
      });
    checkPresentation();
    window.addEventListener("focus", checkPresentation);
    document.addEventListener("visibilitychange", checkPresentation);
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      observer.disconnect();
      window.removeEventListener("focus", checkPresentation);
      document.removeEventListener("visibilitychange", checkPresentation);
    };
  }, [notification.id, onPresented]);
  return (
    <span ref={ref}>
      <NotificationChanges changes={notification.changes} />
    </span>
  );
}
