"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { BellIcon, Settings2Icon } from "lucide-react";
import type { SupportedLocale } from "@repo/i18n";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@repo/ui/components/popover";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";
import { localizePath } from "@/i18n/paths";
import { useActivityNotifications } from "./ActivityNotificationsProvider";
import {
  NotificationTimeline,
  NotificationsEmpty,
} from "./NotificationTimeline";

export function NotificationsBell() {
  const notifications = useActivityNotifications();
  const [open, setOpen] = useState(false);
  const [mutationError, setMutationError] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const mobile = useIsMobile();
  const t = useTranslations("notifications");
  const locale = useLocale() as SupportedLocale;
  if (!notifications) return null;
  const changeOpen = (value: boolean) => {
    setOpen(value);
    if (value) void notifications.refresh().catch(() => {});
  };
  const label = notifications.unreadCount
    ? t("unreadCount", { count: notifications.unreadCount })
    : t("title");
  const bell = (
    <>
      <BellIcon aria-hidden="true" />
      {notifications.unreadCount ? (
        <Badge
          key={notifications.unreadCount}
          className="absolute -top-1 -end-1 min-w-5 px-1 motion-safe:animate-in motion-safe:fade-in-0 duration-fast"
          aria-hidden="true"
        >
          {notifications.unreadCount > 99 ? "99+" : notifications.unreadCount}
        </Badge>
      ) : null}
    </>
  );
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="relative"
      aria-label={label}
    >
      {bell}
    </Button>
  );
  const settings = (
    <Link
      href={localizePath("/account/settings#notifications", locale)}
      className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      aria-label={t("settings")}
      onClick={() => setOpen(false)}
    >
      <Settings2Icon aria-hidden="true" />
    </Link>
  );
  const preview = (
    <>
      {notifications.error || mutationError ? (
        <p role="alert" className="text-sm text-destructive">
          {t(mutationError ? "mutationError" : "error")}
        </p>
      ) : null}
      {notifications.recent.length ? (
        <NotificationTimeline
          items={notifications.recent}
          compact
          onOpen={() => setOpen(false)}
          onRead={async (id) => {
            if (pendingId === id) return;
            setPendingId(id);
            try {
              await notifications.markRead(id);
              setMutationError(false);
            } catch (error) {
              setMutationError(true);
              throw error;
            } finally {
              setPendingId(null);
            }
          }}
        />
      ) : (
        <NotificationsEmpty />
      )}
    </>
  );
  const viewAll = (
    <Link
      href={localizePath("/notifications", locale)}
      className={buttonVariants({ variant: "outline", size: "sm" })}
      onClick={() => setOpen(false)}
    >
      {t("viewAll")}
    </Link>
  );
  if (mobile)
    return (
      <Link
        href={localizePath("/notifications", locale)}
        className={buttonVariants({
          variant: "ghost",
          size: "icon-sm",
          className: "relative",
        })}
        aria-label={label}
      >
        {bell}
      </Link>
    );
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align="end"
        className="w-96 max-w-[calc(100vw-var(--spacing-8))] gap-3 p-3"
      >
        <PopoverHeader>
          <div className="flex items-center justify-between gap-3">
            <PopoverTitle>{t("title")}</PopoverTitle>
            {settings}
          </div>
          <p className="text-xs text-muted-foreground">
            {notifications.unreadCount
              ? t("unreadCount", { count: notifications.unreadCount })
              : t("recent")}
          </p>
        </PopoverHeader>
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
          {preview}
        </div>
        {viewAll}
      </PopoverContent>
    </Popover>
  );
}
