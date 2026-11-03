"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { PageLayout } from "@repo/ui/components/page-layout";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";
import { Label } from "@repo/ui/components/label";
import { Button } from "@repo/ui/components/button";
import {
  SaveButton,
  type SaveButtonState,
} from "@repo/ui/components/save-button";
import { ListEmpty, ListItems } from "@repo/ui/components/list";
import { webApi } from "@/lib/api";
import { canAccess } from "@/lib/access";
import { useSession } from "@/components/auth/SessionProvider";
import { useRemote } from "@/components/WorkspaceForm";
import { useActivityNotifications } from "@/components/notifications/ActivityNotificationsProvider";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { NotificationSettings } from "./NotificationSettings";

type Tab = "inbox" | "activity" | "settings";

export function NotificationsWorkspace({
  initialTab = "inbox",
  openId,
}: {
  initialTab?: Tab;
  openId?: string;
}) {
  const t = useTranslations("notifications");
  const { user } = useSession();
  const canReadActivity = canAccess(user, "notifications.activity.read");
  const [tab, setTab] = useState<Tab>(
    initialTab === "activity" && !canReadActivity ? "inbox" : initialTab,
  );
  const [category, setCategory] = useState<
    v1.notifications.NotificationCategory | "all"
  >("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  return (
    <PageLayout>
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList variant="line">
            <TabsTrigger value="inbox">{t("inbox")}</TabsTrigger>
            {canReadActivity ? (
              <TabsTrigger value="activity">{t("activity")}</TabsTrigger>
            ) : null}
            <TabsTrigger value="settings">{t("settings")}</TabsTrigger>
          </TabsList>
          <TabsContent value="settings" className="pt-4">
            <NotificationSettings />
          </TabsContent>
          {(["inbox", ...(canReadActivity ? ["activity"] : [])] as const).map(
            (mode) => (
              <TabsContent value={mode} key={mode} className="pt-4">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-2">
                      <Label htmlFor={`notifications-category-${mode}`}>
                        {t("category")}
                      </Label>
                      <Select
                        value={category}
                        onValueChange={(value) =>
                          setCategory(value as typeof category)
                        }
                      >
                        <SelectTrigger id={`notifications-category-${mode}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            {t("allCategories")}
                          </SelectItem>
                          {v1.notifications.NOTIFICATION_CATEGORIES.map(
                            (value) => (
                              <SelectItem key={value} value={value}>
                                {t(`categories.${value}`)}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    {mode === "inbox" ? (
                      <Label htmlFor="notifications-unread-only">
                        <Switch
                          id="notifications-unread-only"
                          checked={unreadOnly}
                          onCheckedChange={setUnreadOnly}
                        />
                        {t("unread")}
                      </Label>
                    ) : null}
                  </div>
                  <NotificationFeed
                    key={`${mode}:${category}:${unreadOnly}`}
                    activity={mode === "activity"}
                    category={category}
                    unreadOnly={unreadOnly}
                    openId={mode === "inbox" ? openId : undefined}
                  />
                </div>
              </TabsContent>
            ),
          )}
        </Tabs>
      </div>
    </PageLayout>
  );
}

function NotificationFeed({
  activity,
  category,
  unreadOnly,
  openId,
}: {
  activity: boolean;
  category: v1.notifications.NotificationCategory | "all";
  unreadOnly: boolean;
  openId?: string;
}) {
  const t = useTranslations("notifications");
  const context = useActivityNotifications();
  const [mutationError, setMutationError] = useState(false);
  const [morePending, setMorePending] = useState(false);
  const [readPending, setReadPending] = useState<string | null>(null);
  const [allReadState, setAllReadState] = useState<SaveButtonState>("idle");
  const runningRead = useRef(new Set<string>());
  const allReadRunning = useRef(false);
  const moreRunning = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const endpoint = activity
    ? v1.notifications.ROUTES.activity
    : v1.notifications.ROUTES.list;
  const query = new URLSearchParams({ limit: "30" });
  if (category !== "all") query.set("category", category);
  if (!activity && unreadOnly) query.set("unreadOnly", "true");
  const basePath = `${endpoint}?${query}`;
  const load = useCallback(async () => {
    const list = await webApi.fetch(
      basePath,
      v1.notifications.notificationListSchema,
      { cache: "no-store" },
    );
    if (!openId || activity) return list;
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
  }, [basePath, openId, activity]);
  const remote = useRemote(load);
  const reload = remote.reload;
  useEffect(() => {
    window.addEventListener("notifications-updated", reload);
    return () => window.removeEventListener("notifications-updated", reload);
  }, [reload]);

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
              items: unreadOnly
                ? current.items.filter((item) => item.id !== id)
                : current.items.map((item) =>
                    item.id === id
                      ? { ...item, readAt: new Date().toISOString() }
                      : item,
                  ),
            }
          : current,
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

  async function markAllRead() {
    if (allReadRunning.current || !remote.data) return;
    allReadRunning.current = true;
    setAllReadState("pending");
    try {
      if (context) await context.markAllRead(remote.data.cutoff);
      else
        await webApi.fetch(
          v1.notifications.ROUTES.readAll,
          v1.notifications.notificationMutationResultSchema,
          { method: "POST", json: { cutoff: remote.data.cutoff } },
        );
      if (!alive.current) return;
      setAllReadState("success");
      setMutationError(false);
      reload();
      if (!context)
        window.dispatchEvent(new CustomEvent("notifications-updated"));
    } catch {
      if (alive.current) {
        setMutationError(true);
        setAllReadState("error");
      }
    } finally {
      allReadRunning.current = false;
    }
  }

  async function loadMore() {
    if (moreRunning.current || !remote.data?.nextCursor) return;
    moreRunning.current = true;
    setMorePending(true);
    try {
      const next = await webApi.fetch(
        `${basePath}&cursor=${encodeURIComponent(remote.data.nextCursor)}`,
        v1.notifications.notificationListSchema,
        { cache: "no-store" },
      );
      if (!alive.current) return;
      remote.setData((current) =>
        current
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
          : next,
      );
      setMutationError(false);
    } catch {
      if (alive.current) setMutationError(true);
    } finally {
      moreRunning.current = false;
      if (alive.current) setMorePending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={remote.loading}
          onClick={() => {
            setAllReadState("idle");
            reload();
          }}
        >
          {t("refresh")}
        </Button>
        {!activity ? (
          <SaveButton
            type="button"
            size="sm"
            variant="outline"
            state={allReadState}
            disabled={!remote.data?.unreadCount || remote.loading}
            onClick={() => void markAllRead()}
            idleLabel={t("markAllRead")}
            pendingLabel={t("markingRead")}
            successLabel={t("markedRead")}
          />
        ) : null}
      </div>
      {remote.error || mutationError ? (
        <p role="alert" className="text-sm text-destructive">
          {t(remote.error ? "error" : "mutationError")}
        </p>
      ) : null}
      {remote.loading && !remote.data ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("loading")}
        </p>
      ) : null}
      {remote.data ? (
        <ListItems
          items={remote.data.items}
          getItemKey={(item) => item.id}
          empty={
            <ListEmpty>{t(activity ? "emptyActivity" : "empty")}</ListEmpty>
          }
          renderItem={(item) => (
            <NotificationItem
              item={item}
              activity={activity}
              pending={readPending === item.id}
              onRead={markRead}
            />
          )}
        />
      ) : null}
      {remote.data?.nextCursor ? (
        <Button
          type="button"
          variant="outline"
          disabled={morePending}
          onClick={() => void loadMore()}
        >
          {t(morePending ? "loadingMore" : "loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
