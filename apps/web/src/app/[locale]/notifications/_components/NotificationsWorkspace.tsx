"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { PageLayout } from "@repo/ui/components/page-layout";
import { Button } from "@repo/ui/components/button";
import { ArrowUpIcon } from "lucide-react";
import { webApi } from "@/lib/api";
import { useSession } from "@/components/auth/SessionProvider";
import { useRemote } from "@/components/WorkspaceForm";
import { usePageRefresh } from "@/components/PageRefresh";
import { InfiniteListFooter } from "@/components/InfiniteListFooter";
import { useActivityNotifications } from "@/components/notifications/ActivityNotificationsProvider";
import {
  NotificationTimeline,
  NotificationsEmpty,
  NotificationsLoading,
} from "@/components/notifications/NotificationTimeline";
import {
  notificationsAfterVisit,
  useNotificationsVisit,
} from "./useNotificationsVisit";
import { useNotificationHistory } from "./useNotificationHistory";

export function NotificationsWorkspace({ openId }: { openId?: string }) {
  const t = useTranslations("notifications");
  const { user } = useSession();
  const { pageRef, restored, ready, rememberList, onClickCapture } =
    useNotificationHistory(user?.id ?? "", user?.accessRevision ?? 0);
  const visit = useNotificationsVisit();
  return (
    <PageLayout width="form" ref={pageRef} onClickCapture={onClickCapture}>
      {visit.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 text-sm text-destructive"
        >
          <p>{t("seenError")}</p>
          <Button
            type="button"
            variant="outline"
            disabled={visit.pending}
            onClick={() => void visit.retry()}
          >
            {t("retrySeen")}
          </Button>
        </div>
      ) : null}
      {ready ? (
        <NotificationFeed
          openId={openId}
          initialList={restored?.list}
          seenCutoff={visit.seenCutoff}
          onSnapshot={rememberList}
        />
      ) : (
        <NotificationsLoading />
      )}
    </PageLayout>
  );
}

function NotificationFeed({
  openId,
  initialList,
  seenCutoff,
  onSnapshot,
}: {
  openId?: string;
  initialList?: v1.notifications.NotificationList;
  seenCutoff: string | null;
  onSnapshot: (list: v1.notifications.NotificationList) => void;
}) {
  const t = useTranslations("notifications");
  const shared = useTranslations("shared");
  const context = useActivityNotifications();
  const [mutationError, setMutationError] = useState(false);
  const [morePending, setMorePending] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [readPending, setReadPending] = useState<string | null>(null);
  const runningRead = useRef(new Set<string>());
  const moreRunning = useRef(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const requestVersion = useRef(0);
  const restoredList = useRef(initialList);
  const [incoming, setIncoming] =
    useState<v1.notifications.NotificationList | null>(null);
  const [enteringIds, setEnteringIds] = useState<string[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const basePath = `${v1.notifications.ROUTES.list}?limit=30`;
  const load = useCallback(async () => {
    requestVersion.current += 1;
    if (restoredList.current) return restoredList.current;
    const list = await webApi.fetch(
      basePath,
      v1.notifications.notificationListSchema,
      { cache: "no-store" },
    );
    if (!openId) return list;
    try {
      const selected = await webApi.fetch(
        v1.notifications.ROUTES.detail(openId),
        v1.notifications.notificationSchema,
        { cache: "no-store" },
      );
      await webApi.fetch(
        v1.notifications.ROUTES.read(openId),
        v1.notifications.notificationMutationResultSchema,
        { method: "PATCH", json: {} },
      );
      const item = {
        ...selected,
        readAt: selected.readAt ?? new Date().toISOString(),
      };
      return {
        ...list,
        items: [item, ...list.items.filter((entry) => entry.id !== item.id)],
      };
    } catch {
      // An old push may refer to a record the recipient can no longer access.
      return list;
    }
  }, [basePath, openId]);
  const remote = useRemote(load);
  const displayList = useMemo(
    () =>
      remote.data ? notificationsAfterVisit(remote.data, seenCutoff) : null,
    [remote.data, seenCutoff],
  );
  useLayoutEffect(() => {
    if (displayList) onSnapshot(displayList);
  }, [displayList, onSnapshot]);
  const reload = remote.reload;
  const refreshFeed = () => {
    restoredList.current = undefined;
    requestVersion.current += 1;
    moreRunning.current = false;
    setMorePending(false);
    setMoreError(null);
    setIncoming(null);
    reload();
  };
  const refreshDisabled = morePending || readPending !== null;
  usePageRefresh(refreshFeed, {
    refreshing: remote.loading,
    disabled: refreshDisabled,
  });
  const setData = remote.setData;
  const snapshotRef = useRef(remote.data);
  useEffect(() => {
    snapshotRef.current = remote.data;
  }, [remote.data]);
  useEffect(() => {
    const controller = new AbortController();
    const sync = async () => {
      if (syncing.current || !snapshotRef.current) return;
      syncing.current = true;
      const version = requestVersion.current;
      try {
        const next = await webApi.fetch(
          basePath,
          v1.notifications.notificationListSchema,
          { cache: "no-store", signal: controller.signal },
        );
        if (controller.signal.aborted || version !== requestVersion.current)
          return;
        const current = snapshotRef.current;
        if (!current) return;
        const known = new Set(current.items.map((item) => item.id));
        const additions = next.items.filter(
          (item) => !known.has(item.id) && item.createdAt >= current.cutoff,
        );
        const readerAway =
          (feedRef.current?.getBoundingClientRect().top ?? 0) < 0 ||
          !!feedRef.current?.contains(document.activeElement);
        if (additions.length && readerAway) {
          setIncoming(next);
          return;
        }
        if (additions.length) {
          setEnteringIds(additions.map((item) => item.id));
          setData(next);
        } else {
          // Replace the authoritative first page (including source-access removals),
          // retaining already-loaded older pages when no new rows are inserted.
          const nextIds = new Set(next.items.map((item) => item.id));
          setData((previous) =>
            previous
              ? {
                  ...previous,
                  unreadCount: next.unreadCount,
                  cutoff: next.cutoff,
                  nextCursor:
                    previous.items.length > 30
                      ? previous.nextCursor
                      : next.nextCursor,
                  items: [
                    ...next.items,
                    ...previous.items
                      .slice(30)
                      .filter((item) => !nextIds.has(item.id)),
                  ],
                }
              : next,
          );
        }
        setIncoming(null);
      } catch {
        /* The next provider update or pull-to-refresh can recover without replacing the feed. */
      } finally {
        syncing.current = false;
      }
    };
    window.addEventListener("notifications-updated", sync);
    return () => {
      controller.abort();
      window.removeEventListener("notifications-updated", sync);
    };
  }, [basePath, setData]);

  const incomingCount =
    incoming?.items.filter(
      (item) =>
        !remote.data?.items.some((current) => current.id === item.id) &&
        item.createdAt >= (remote.data?.cutoff ?? ""),
    ).length ?? 0;
  function showIncoming() {
    if (!incoming) return;
    const known = new Set(remote.data?.items.map((item) => item.id));
    setEnteringIds(
      incoming.items
        .filter((item) => !known.has(item.id))
        .map((item) => item.id),
    );
    remote.setData(incoming);
    setIncoming(null);
    feedRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }

  async function markRead(id: string) {
    if (runningRead.current.has(id)) return;
    runningRead.current.add(id);
    setReadPending(id);
    try {
      if (context) await context.markRead(id);
      else
        await webApi.fetch(
          v1.notifications.ROUTES.read(id),
          v1.notifications.notificationMutationResultSchema,
          { method: "PATCH", json: {} },
        );
      if (!alive.current) return;
      remote.setData((current) =>
        current
          ? {
              ...current,
              unreadCount: Math.max(0, current.unreadCount - 1),
              items: current.items.map((item) =>
                item.id === id
                  ? { ...item, readAt: new Date().toISOString() }
                  : item,
              ),
            }
          : current,
      );
      setIncoming((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === id
                  ? { ...item, readAt: new Date().toISOString() }
                  : item,
              ),
            }
          : null,
      );
      setMutationError(false);
      if (!context)
        window.dispatchEvent(new CustomEvent("notifications-updated"));
    } catch (error) {
      if (alive.current) setMutationError(true);
      throw error;
    } finally {
      runningRead.current.delete(id);
      if (alive.current) setReadPending(null);
    }
  }

  const nextCursor = remote.data?.nextCursor;
  const loading = remote.loading;
  const loadMore = useCallback(async () => {
    if (moreRunning.current || loading || !nextCursor) return;
    const version = requestVersion.current;
    moreRunning.current = true;
    setMorePending(true);
    setMoreError(null);
    try {
      const next = await webApi.fetch(
        `${basePath}&cursor=${encodeURIComponent(nextCursor)}`,
        v1.notifications.notificationListSchema,
        { cache: "no-store" },
      );
      if (!alive.current || version !== requestVersion.current) return;
      setData((current) =>
        current && current.nextCursor === nextCursor
          ? {
              ...next,
              cutoff: current.cutoff,
              items: [
                ...current.items,
                ...next.items.filter(
                  (item) =>
                    !current.items.some((existing) => existing.id === item.id),
                ),
              ],
            }
          : current,
      );
    } catch {
      if (alive.current && version === requestVersion.current)
        setMoreError(t("loadMoreError"));
    } finally {
      if (alive.current && version === requestVersion.current) {
        moreRunning.current = false;
        setMorePending(false);
      }
    }
  }, [basePath, nextCursor, loading, setData, t]);

  return (
    <div ref={feedRef} className="flex min-w-0 flex-col gap-4">
      {incomingCount ? (
        <div
          className="sticky top-4 z-sticky flex justify-center"
          role="status"
        >
          <Button
            type="button"
            size="sm"
            onClick={showIncoming}
            aria-label={t("showNew")}
          >
            <ArrowUpIcon aria-hidden="true" />
            {t("newNotifications", { count: incomingCount })}
          </Button>
        </div>
      ) : null}
      {remote.error || mutationError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 text-sm text-destructive"
        >
          <p>{t(remote.error ? "error" : "mutationError")}</p>
          {remote.error ? (
            <Button
              type="button"
              variant="outline"
              disabled={remote.loading || refreshDisabled}
              onClick={refreshFeed}
            >
              {shared("actions.retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {remote.loading && !remote.data ? <NotificationsLoading /> : null}
      {displayList ? (
        displayList.items.length ? (
          <NotificationTimeline
            items={displayList.items}
            enteringIds={enteringIds}
            onRead={markRead}
          />
        ) : (
          <NotificationsEmpty />
        )
      ) : null}
      <InfiniteListFooter
        hasMore={Boolean(nextCursor)}
        loading={morePending || remote.loading}
        error={moreError}
        onLoadMore={loadMore}
      />
    </div>
  );
}
