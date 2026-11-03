"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { v1 } from "@repo/api-shared";
import { BellCheckIcon, FilterIcon } from "lucide-react";
import { ListItems } from "@repo/ui/components/list";
import { Skeleton } from "@repo/ui/components/skeleton";
import { TooltipProvider } from "@repo/ui/components/tooltip";
import { Separator } from "@repo/ui/components/separator";
import { NotificationItem } from "./NotificationItem";
import {
  notificationDateKey,
  notificationDateLabel,
} from "./notification-time";

export function NotificationTimeline({
  items,
  activity = false,
  compact = false,
  enteringIds = [],
  onRead,
  onOpen,
}: {
  items: readonly v1.notifications.Notification[];
  activity?: boolean;
  compact?: boolean;
  enteringIds?: readonly string[];
  onRead?: (id: string) => Promise<void>;
  onOpen?: () => void;
}) {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const groups = useMemo(() => {
    const days = new Map<string, v1.notifications.Notification[]>();
    for (const item of items) {
      const key = notificationDateKey(item.createdAt);
      const rows = days.get(key);
      if (rows) rows.push(item);
      else days.set(key, [item]);
    }
    for (const rows of days.values()) {
      rows.sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      );
    }
    return [...days.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [items]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  const renderItem = (item: v1.notifications.Notification) => (
    <NotificationItem
      item={item}
      activity={activity}
      compact={compact}
      now={now}
      entering={enteringIds.includes(item.id)}
      onRead={onRead}
      onOpen={onOpen}
    />
  );
  if (compact)
    return (
      <TooltipProvider>
        <ListItems
          items={items}
          getItemKey={(item) => item.id}
          renderItem={renderItem}
          className="gap-1"
        />
      </TooltipProvider>
    );
  return (
    <TooltipProvider>
      <div className="flex min-w-0 flex-col gap-6">
        {groups.map(([day, rows]) => {
          const label = notificationDateLabel(rows[0]!.createdAt, now, locale, {
            today: t("today"),
            yesterday: t("yesterday"),
          });
          return (
            <section
              key={day}
              aria-label={label}
              className="flex min-w-0 flex-col gap-2"
            >
              <div className="flex items-center gap-3 px-3 sm:px-4">
                <h2 className="shrink-0 text-xs font-medium text-muted-foreground">
                  {label}
                </h2>
                <Separator aria-hidden="true" className="min-w-0 flex-1" />
              </div>
              <ListItems
                items={rows}
                getItemKey={(item) => item.id}
                renderItem={renderItem}
                className="gap-1"
              />
            </section>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export function NotificationsEmpty({
  activity = false,
  filtered = false,
  unreadOnly = false,
}: {
  activity?: boolean;
  filtered?: boolean;
  unreadOnly?: boolean;
}) {
  const t = useTranslations("notifications");
  const Icon = filtered ? FilterIcon : BellCheckIcon;
  return (
    <div
      className="flex flex-col items-center gap-3 py-12 text-center"
      role="status"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium">
        {t(
          filtered
            ? "emptyFiltered"
            : unreadOnly
              ? "emptyUnread"
              : activity
                ? "emptyActivity"
                : "empty",
        )}
      </p>
      {!filtered && !activity ? (
        <p className="max-w-72 text-sm text-muted-foreground">
          {t("caughtUpHelp")}
        </p>
      ) : null}
    </div>
  );
}

export function NotificationsLoading() {
  const t = useTranslations("notifications");
  return (
    <div
      role="status"
      aria-label={t("loading")}
      className="flex flex-col gap-4"
    >
      {[0, 1, 2].map((key) => (
        <div key={key} className="flex gap-3 p-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
