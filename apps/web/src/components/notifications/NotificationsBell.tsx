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
import { localizePath } from "@/i18n/paths";
import { useActivityNotifications } from "./ActivityNotificationsProvider";
import { NotificationItem } from "./NotificationItem";

export function NotificationsBell() {
  const notifications = useActivityNotifications();
  const [open, setOpen] = useState(false);
  const [mutationError, setMutationError] = useState(false);
  const t = useTranslations("notifications");
  const locale = useLocale() as SupportedLocale;
  if (!notifications) return null;
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) void notifications.refresh().catch(() => {});
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label={
              notifications.unreadCount
                ? t("unreadCount", { count: notifications.unreadCount })
                : t("title")
            }
          />
        }
      >
        <BellIcon aria-hidden="true" />
        {notifications.unreadCount ? (
          <Badge
            className="absolute -top-1 -end-1 min-w-5 px-1"
            aria-hidden="true"
          >
            {notifications.unreadCount > 99 ? "99+" : notifications.unreadCount}
          </Badge>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 max-w-[calc(100vw-var(--spacing-8))] p-3"
      >
        <PopoverHeader>
          <div className="flex items-center justify-between gap-3">
            <PopoverTitle>{t("recent")}</PopoverTitle>
            <Link
              href={`${localizePath("/notifications", locale)}?tab=settings`}
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
              aria-label={t("settings")}
              onClick={() => setOpen(false)}
            >
              <Settings2Icon aria-hidden="true" />
            </Link>
          </div>
        </PopoverHeader>
        {notifications.error || mutationError ? (
          <p role="alert" className="text-sm text-destructive">
            {t(mutationError ? "mutationError" : "error")}
          </p>
        ) : null}
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
          {notifications.recent.length ? (
            notifications.recent.map((item) => (
              <NotificationItem
                key={item.id}
                item={item}
                compact
                onRead={async (id) => {
                  try {
                    await notifications.markRead(id);
                    setMutationError(false);
                  } catch (error) {
                    setMutationError(true);
                    throw error;
                  }
                }}
              />
            ))
          ) : (
            <p className="py-4 text-sm text-muted-foreground">{t("empty")}</p>
          )}
        </div>
        <Link
          href={localizePath("/notifications", locale)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
          onClick={() => setOpen(false)}
        >
          {t("viewAll")}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
