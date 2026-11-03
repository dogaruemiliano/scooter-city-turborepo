"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Label } from "@repo/ui/components/label";
import { FormSection } from "@repo/ui/components/form-section";
import { FormActions } from "@repo/ui/components/form-actions";
import {
  SaveButton,
  type SaveButtonState,
} from "@repo/ui/components/save-button";
import { Switch } from "@repo/ui/components/switch";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { webApi } from "@/lib/api";
import { useSession } from "@/components/auth/SessionProvider";
import {
  currentPushSubscription,
  isIosWithoutInstallation,
  registerPush,
  supportsPush,
  unregisterPush,
} from "@/components/notifications/push-client";

type PushStatus =
  | "loading"
  | "enabled"
  | "disabled"
  | "unsupported"
  | "denied"
  | "unconfigured";

export function NotificationSettings() {
  const t = useTranslations("notifications");
  const locale = useLocale() as SupportedLocale;
  const { user } = useSession();
  const [preferences, setPreferences] =
    useState<v1.notifications.NotificationPreferences | null>(null);
  const [config, setConfig] = useState<v1.notifications.PushConfig | null>(
    null,
  );
  const [pushStatus, setPushStatus] = useState<PushStatus>("loading");
  const [iosInstall, setIosInstall] = useState(false);
  const [error, setError] = useState<"load" | "push" | "save" | null>(null);
  const [saveState, setSaveState] = useState<SaveButtonState>("idle");
  const [pushBusy, setPushBusy] = useState(false);
  const submitting = useRef(false);
  const pushSubmitting = useRef(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [nextPreferences, nextConfig, subscription] = await Promise.all([
          webApi.fetch(
            v1.notifications.ROUTES.preferences,
            v1.notifications.notificationPreferencesSchema,
            { cache: "no-store" },
          ),
          webApi.fetch(
            v1.notifications.ROUTES.pushConfig,
            v1.notifications.pushConfigSchema,
            { cache: "no-store" },
          ),
          currentPushSubscription(),
        ]);
        if (cancelled) return;
        setPreferences(nextPreferences);
        setConfig(nextConfig);
        setIosInstall(isIosWithoutInstallation());
        setPushStatus(
          !nextConfig.configured
            ? "unconfigured"
            : !supportsPush()
              ? "unsupported"
              : Notification.permission === "denied"
                ? "denied"
                : subscription
                  ? "enabled"
                  : "disabled",
        );
        setError(null);
      } catch {
        if (!cancelled) setError("load");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [revision, user?.id]);

  async function changePush() {
    if (pushSubmitting.current || !user || !config?.publicKey) return;
    pushSubmitting.current = true;
    setPushBusy(true);
    setError(null);
    try {
      if (pushStatus === "enabled") {
        await unregisterPush();
        setPushStatus("disabled");
      } else {
        await registerPush(config.publicKey, locale, user.id);
        setPushStatus("enabled");
      }
    } catch {
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "denied"
      )
        setPushStatus("denied");
      else if (!(await currentPushSubscription().catch(() => null)))
        setPushStatus("disabled");
      setError("push");
    } finally {
      pushSubmitting.current = false;
      setPushBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !preferences) return;
    submitting.current = true;
    setSaveState("pending");
    setError(null);
    try {
      const updated = await webApi.fetch(
        v1.notifications.ROUTES.preferences,
        v1.notifications.notificationPreferencesSchema,
        { method: "PATCH", json: preferences },
      );
      setPreferences(updated);
      setSaveState("success");
    } catch {
      setError("save");
      setSaveState("error");
    } finally {
      submitting.current = false;
    }
  }

  if (!preferences)
    return (
      <div className="flex flex-col items-start gap-3">
        <p
          role={error ? "alert" : "status"}
          className="text-sm text-muted-foreground"
        >
          {t(error ? "error" : "loading")}
        </p>
        {error ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t("refresh")}
          </Button>
        ) : null}
      </div>
    );

  const statusKeys = {
    loading: "loading",
    enabled: "pushEnabled",
    disabled: "pushDisabled",
    unsupported: "pushUnsupported",
    denied: "pushDenied",
    unconfigured: "pushUnconfigured",
  } as const;
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col items-start gap-3">
        <h2 className="text-base font-semibold">{t("pushHeading")}</h2>
        <p className="text-sm text-muted-foreground">{t("pushHelp")}</p>
        <p role="status" className="text-sm">
          {t(statusKeys[pushStatus])}
        </p>
        {iosInstall ? (
          <p className="text-sm text-muted-foreground">{t("iosInstall")}</p>
        ) : null}
        {["enabled", "disabled"].includes(pushStatus) ? (
          <Button
            type="button"
            variant="outline"
            disabled={pushBusy}
            onClick={() => void changePush()}
          >
            {t(
              pushBusy
                ? pushStatus === "enabled"
                  ? "disablingPush"
                  : "enablingPush"
                : pushStatus === "enabled"
                  ? "disablePush"
                  : "enablePush",
            )}
          </Button>
        ) : null}
        {error === "push" ? (
          <Alert>
            <AlertDescription>{t("pushError")}</AlertDescription>
          </Alert>
        ) : null}
      </section>
      <form
        onSubmit={(event) => void save(event)}
        className="flex flex-col gap-6"
      >
        <FormSection title={t("preferences")} columns={1}>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="notifications-push-enabled">
              {t("pushPreference")}
            </Label>
            <Switch
              id="notifications-push-enabled"
              checked={preferences.pushEnabled}
              disabled={saveState === "pending"}
              onCheckedChange={(checked) => {
                setPreferences({ ...preferences, pushEnabled: checked });
                setSaveState("idle");
              }}
            />
          </div>
          <fieldset
            className="flex flex-col gap-4"
            disabled={saveState === "pending"}
          >
            <legend className="mb-3 text-sm font-medium">
              {t("pushCategories")}
            </legend>
            <p className="text-sm text-muted-foreground">
              {t("categoriesHelp")}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {v1.notifications.NOTIFICATION_CATEGORIES.map((category) => (
                <Label
                  key={category}
                  htmlFor={`notifications-category-${category}`}
                >
                  <Checkbox
                    id={`notifications-category-${category}`}
                    checked={!preferences.mutedCategories.includes(category)}
                    onCheckedChange={(checked) => {
                      setPreferences({
                        ...preferences,
                        mutedCategories: checked
                          ? preferences.mutedCategories.filter(
                              (value) => value !== category,
                            )
                          : [...preferences.mutedCategories, category],
                      });
                      setSaveState("idle");
                    }}
                  />
                  {t(`categories.${category}`)}
                </Label>
              ))}
            </div>
          </fieldset>
        </FormSection>
        {error === "save" ? (
          <Alert>
            <AlertDescription>{t("preferencesError")}</AlertDescription>
          </Alert>
        ) : null}
        <FormActions
          pending={saveState === "pending"}
          status={saveState === "success" ? t("savedPreferences") : undefined}
        >
          <SaveButton
            type="submit"
            state={saveState}
            idleLabel={t("savePreferences")}
            pendingLabel={t("savingPreferences")}
            successLabel={t("savedPreferences")}
          />
        </FormActions>
      </form>
      <p className="text-sm text-muted-foreground">{t("futureEmail")}</p>
    </div>
  );
}
