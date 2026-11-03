"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { formatNotificationMessage, type SupportedLocale } from "@repo/i18n";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { CheckIcon } from "lucide-react";
import { localizePath, safeLocalPath } from "@/i18n/paths";

export function notificationHref(
  notification: v1.notifications.Notification,
  locale: SupportedLocale,
) {
  return notification.reason !== "unassigned" && notification.targetPath
    ? localizePath(
        safeLocalPath(notification.targetPath, "/notifications"),
        locale,
      )
    : null;
}

export function NotificationChanges({
  changes,
}: {
  changes: readonly string[];
}) {
  const t = useTranslations("notifications");
  const labels = changes
    .filter((field) => t.has(`fields.${field}`))
    .map((field) => t(`fields.${field}`));
  return labels.length ? (
    <span>{t("changedFields", { fields: labels.join(", ") })}</span>
  ) : null;
}

export function NotificationItem({
  item,
  activity = false,
  compact = false,
  pending = false,
  onRead,
}: {
  item: v1.notifications.Notification;
  activity?: boolean;
  compact?: boolean;
  pending?: boolean;
  onRead?: (id: string) => Promise<void>;
}) {
  const t = useTranslations("notifications");
  const locale = useLocale() as SupportedLocale;
  const href = notificationHref(item, locale);
  const message = formatNotificationMessage(locale, item).body;
  return (
    <article
      data-notification-id={item.id}
      className="flex min-w-0 items-start gap-3 rounded-lg border border-border p-3"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t(`categories.${item.category}`)}
          </span>
          {!activity && !item.readAt ? (
            <Badge variant="secondary">{t("unreadBadge")}</Badge>
          ) : null}
          {item.scooter && item.reason !== "unassigned" ? (
            <Badge variant="outline">
              {v1.scooters.scooterDisplayCode(item.scooter)}
            </Badge>
          ) : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              if (!activity && !item.readAt && onRead)
                void onRead(item.id).catch(() => {});
            }}
          >
            {message}
          </Link>
        ) : (
          <p className="text-sm font-medium">{message}</p>
        )}
        {!compact && item.reason !== "unassigned" && item.changes.length ? (
          <p className="text-sm text-muted-foreground">
            <NotificationChanges changes={item.changes} />
          </p>
        ) : null}
        {!href && item.reason !== "unassigned" ? (
          <p className="text-xs text-muted-foreground">{t("unavailable")}</p>
        ) : null}
        <time
          className="text-xs text-muted-foreground"
          dateTime={item.createdAt}
        >
          {new Date(item.createdAt).toLocaleString(locale)}
        </time>
      </div>
      {!activity && !item.readAt && onRead ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          aria-label={t("markRead")}
          onClick={() => {
            void onRead(item.id).catch(() => {});
          }}
        >
          <CheckIcon aria-hidden="true" />
        </Button>
      ) : null}
    </article>
  );
}
