"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import {
  formatNotificationMessageParts,
  type SupportedLocale,
} from "@repo/i18n";
import { Badge } from "@repo/ui/components/badge";
import {
  BellIcon,
  CircleCheckIcon,
  ClipboardListIcon,
  KeyRoundIcon,
  MapPinIcon,
  MessageSquareIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  TagIcon,
  UserRoundIcon,
  WrenchIcon,
  BikeIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { cn } from "@repo/ui/lib/utils";
import { localizePath, safeLocalPath } from "@/i18n/paths";
import { notificationRelativeTime } from "./notification-time";

function eventAppearance(item: v1.notifications.Notification): {
  icon: LucideIcon;
  tone: string;
} {
  if (item.type.endsWith(".commented"))
    return { icon: MessageSquareIcon, tone: "bg-info-subtle text-info" };
  if (item.type.endsWith(".resolved"))
    return { icon: CircleCheckIcon, tone: "bg-success-subtle text-success" };
  if (item.changes.includes("location") && item.changes.length === 1)
    return { icon: MapPinIcon, tone: "bg-muted text-muted-foreground" };
  const icons: Record<v1.notifications.NotificationCategory, LucideIcon> = {
    scooters: BikeIcon,
    rentals: KeyRoundIcon,
    persons: UserRoundIcon,
    access: ShieldCheckIcon,
    jobs: item.subjectType === "todo" ? ClipboardListIcon : WrenchIcon,
    expenses: ReceiptTextIcon,
    brands: TagIcon,
    other: BellIcon,
  };
  return { icon: icons[item.category], tone: "bg-muted text-muted-foreground" };
}

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
  now,
  entering = false,
  onRead,
  onOpen,
}: {
  item: v1.notifications.Notification;
  activity?: boolean;
  compact?: boolean;
  now: number;
  entering?: boolean;
  onRead?: (id: string) => Promise<void>;
  onOpen?: () => void;
}) {
  const t = useTranslations("notifications");
  const locale = useLocale() as SupportedLocale;
  const href = notificationHref(item, locale);
  const unread = !activity && !item.readAt;
  const { icon: Icon, tone } = eventAppearance(item);
  const message = formatNotificationMessageParts(locale, item).map(
    (part, index) =>
      part.kind === "text" ? (
        part.text
      ) : (
        <strong
          key={index}
          className={cn(
            unread ? "font-semibold" : "font-medium",
            part.kind === "subject" &&
              item.subjectType === "scooter" &&
              "whitespace-nowrap",
          )}
        >
          {part.text}
        </strong>
      ),
  );
  const exactTime = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(item.createdAt));
  return (
    <article
      data-notification-id={item.id}
      data-unread={unread || undefined}
      data-entering={entering || undefined}
      className={cn(
        "relative flex min-w-0 items-start gap-3 rounded-lg p-3 transition-colors duration-fast ease-standard",
        compact ? "py-3" : "sm:p-4",
        unread
          ? "bg-accent text-accent-foreground"
          : "bg-card text-card-foreground hover:bg-muted",
        "focus-within:ring-2 focus-within:ring-ring",
        entering &&
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2 duration-normal ease-decelerate",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
          tone,
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {href ? (
          <Link
            href={href}
            className="text-sm leading-normal wrap-anywhere outline-none after:absolute after:inset-0 after:rounded-lg"
            onClick={() => {
              if (!activity && !item.readAt && onRead)
                void onRead(item.id).catch(() => {});
              onOpen?.();
            }}
          >
            {message}
          </Link>
        ) : (
          <p className="text-sm leading-normal wrap-anywhere">{message}</p>
        )}
        {!compact && item.reason !== "unassigned" && item.changes.length ? (
          <p
            className={cn(
              "text-xs leading-normal wrap-anywhere",
              unread ? "text-accent-foreground" : "text-muted-foreground",
            )}
          >
            <NotificationChanges changes={item.changes} />
          </p>
        ) : null}
        {!href && item.reason !== "unassigned" ? (
          <p className="text-xs text-muted-foreground">{t("unavailable")}</p>
        ) : null}
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs",
            unread ? "text-accent-foreground" : "text-muted-foreground",
          )}
        >
          {item.scooter && item.reason !== "unassigned" ? (
            <Badge variant="outline">
              {v1.scooters.scooterDisplayCode(item.scooter)}
            </Badge>
          ) : (
            <span>{t(`categories.${item.category}`)}</span>
          )}
          <span aria-hidden="true">·</span>
          <Tooltip>
            <TooltipTrigger
              render={<time dateTime={item.createdAt} tabIndex={0} />}
              className="relative z-raised rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={exactTime}
            >
              {notificationRelativeTime(
                item.createdAt,
                now,
                locale,
                t("justNow"),
              )}
            </TooltipTrigger>
            <TooltipContent role="tooltip">{exactTime}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {unread ? (
        <span className="relative z-raised flex size-5 shrink-0 items-center justify-center">
          <span className="size-2 rounded-full bg-link" aria-hidden="true" />
          <span className="sr-only">{t("unreadBadge")}</span>
        </span>
      ) : null}
    </article>
  );
}
