"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { FormActions } from "@repo/ui/components/form-actions";
import { SaveButton } from "@repo/ui/components/save-button";
import { webApi } from "@/lib/api";
import {
  isIosWithoutInstallation,
  registerPush,
  supportsPush,
} from "./push-client";
import {
  hasSeenPushPrompt,
  pushPromptStorageKey,
  rememberPushPrompt,
} from "./push-prompt-storage";

/** Mounted only for an authenticated account with notification access. */
export function PushPermissionPrompt({ userId }: { userId: string }) {
  const t = useTranslations("notifications");
  const locale = useLocale() as SupportedLocale;
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"denied" | "failed" | null>(null);
  const submitting = useRef(false);
  const actionController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    actionController.current = controller;
    return () => controller.abort();
  }, [userId]);

  useEffect(() => {
    if (
      !supportsPush() ||
      isIosWithoutInstallation() ||
      Notification.permission !== "default" ||
      hasSeenPushPrompt(userId)
    )
      return;

    let cancelled = false;
    let offered = false;
    let readyKey: string | null = null;
    const controller = new AbortController();
    const offer = () => {
      if (
        cancelled ||
        offered ||
        !readyKey ||
        document.visibilityState !== "visible" ||
        !document.hasFocus() ||
        Notification.permission !== "default" ||
        hasSeenPushPrompt(userId)
      )
        return;
      offered = true;
      rememberPushPrompt(userId, "shown");
      setPublicKey(readyKey);
      setOpen(true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === pushPromptStorageKey(userId) && event.newValue) {
        offered = true;
        setOpen(false);
      }
    };
    async function prepare() {
      try {
        const [config, preferences] = await Promise.all([
          webApi.fetch(
            v1.notifications.ROUTES.pushConfig,
            v1.notifications.pushConfigSchema,
            { cache: "no-store", signal: controller.signal },
          ),
          webApi.fetch(
            v1.notifications.ROUTES.preferences,
            v1.notifications.notificationPreferencesSchema,
            { cache: "no-store", signal: controller.signal },
          ),
        ]);
        if (
          cancelled ||
          !config.configured ||
          !config.publicKey ||
          !preferences.pushEnabled
        )
          return;
        readyKey = config.publicKey;
        offer();
      } catch {
        // A failed eligibility check must not interrupt the workspace or count as an offer.
      }
    }
    window.addEventListener("focus", offer);
    document.addEventListener("visibilitychange", offer);
    window.addEventListener("storage", onStorage);
    void prepare();
    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener("focus", offer);
      document.removeEventListener("visibilitychange", offer);
      window.removeEventListener("storage", onStorage);
    };
  }, [userId]);

  function dismiss() {
    if (submitting.current) return;
    if (!error) rememberPushPrompt(userId, "dismissed");
    setOpen(false);
  }

  async function enable() {
    if (submitting.current || !publicKey) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    const signal = actionController.current?.signal;
    try {
      // Call directly from the click handler, before any asynchronous work,
      // so the browser permission request retains the user's gesture.
      await registerPush(publicKey, locale, userId, signal);
      if (signal?.aborted) return;
      rememberPushPrompt(userId, "enabled");
      setOpen(false);
    } catch {
      if (signal?.aborted) return;
      if (Notification.permission === "denied") {
        rememberPushPrompt(userId, "denied");
        setError("denied");
      } else if (Notification.permission === "default") {
        rememberPushPrompt(userId, "permission-dismissed");
        setOpen(false);
      } else {
        rememberPushPrompt(userId, "failed");
        setError("failed");
      }
    } finally {
      submitting.current = false;
      if (!signal?.aborted) setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) dismiss();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("pushPrompt.title")}</DialogTitle>
          <DialogDescription>{t("pushPrompt.description")}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("pushPrompt.settingsHint")}
        </p>
        {error ? (
          <Alert role="alert">
            <AlertDescription>
              {t(error === "denied" ? "pushDenied" : "pushError")}
            </AlertDescription>
          </Alert>
        ) : null}
        <FormActions
          pending={busy}
          className="-mx-4 -mb-4 rounded-b-xl"
          arrangement="split"
          density="compact"
        >
          <SaveButton
            type="button"
            state={busy ? "pending" : "idle"}
            disabled={error === "denied"}
            onClick={() => void enable()}
            idleLabel={t("enablePush")}
            pendingLabel={t("enablingPush")}
            successLabel={t("enabledPush")}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={dismiss}
          >
            {t("pushPrompt.notNow")}
          </Button>
        </FormActions>
      </DialogContent>
    </Dialog>
  );
}
