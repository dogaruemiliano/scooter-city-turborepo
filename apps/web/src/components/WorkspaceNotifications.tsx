"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ToastProvider, useToast } from "@repo/ui/components/toast";

const NotificationsContext = createContext<ReturnType<typeof useToast> | null>(
  null,
);

function Notifications({ children }: { children: ReactNode }) {
  const toast = useToast();
  return (
    <NotificationsContext.Provider value={toast}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function WorkspaceNotifications({ children }: { children: ReactNode }) {
  const t = useTranslations("shared.notifications");
  return (
    <ToastProvider closeLabel={t("dismiss")} viewportLabel={t("label")}>
      <Notifications>{children}</Notifications>
    </ToastProvider>
  );
}

/** Also supports isolated forms and tests without a notification viewport. */
export function useWorkspaceNotifications() {
  return useContext(NotificationsContext);
}
