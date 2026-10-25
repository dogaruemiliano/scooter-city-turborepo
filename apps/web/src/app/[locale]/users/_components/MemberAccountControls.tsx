"use client";
import { useFormAction } from "@/lib/form/use-form-action";
import { SaveButton } from "@repo/ui/components/save-button";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { Button } from "@repo/ui/components";
import { Feedback, useTask } from "@/components/WorkspaceForm";
import { webApi } from "@/lib/api";

export function MemberAccountControls({
  user,
  reload,
  disabled = false,
  canInvite = false,
  canManageStatus = false,
  superAdmin = false,
}: {
  user: v1.access.AccessUser;
  reload: () => void;
  disabled?: boolean;
  canInvite?: boolean;
  canManageStatus?: boolean;
  superAdmin?: boolean;
}) {
  const formAction = useFormAction();

  const t = useTranslations("workspace");
  const locale = useLocale();
  const task = useTask();
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  async function lifecycle(action: string) {
    if (!user) return;
    const rev = { expectedRevision: user.accessRevision };
    if (action === "invite" || action === "cancelInvite")
      await webApi.fetch(
        `/v1/users/${user.id}/invitations${action === "cancelInvite" ? "/current" : ""}`,
        v1.access.accessUserSchema,
        { method: action === "invite" ? "POST" : "DELETE", json: rev },
      );
    else if (action === "super")
      await webApi.fetch(
        `/v1/users/${user.id}/super-admin`,
        v1.access.accessUserSchema,
        { method: "PUT", json: { ...rev, isSuperAdmin: !user.isSuperAdmin } },
      );
    else if (action === "customer")
      await webApi.fetch(
        `/v1/persons/${user.personId}/app-access`,
        v1.access.accessUserSchema,
        { method: "PUT", json: { ...rev, enabled: !user.portalEligible } },
      );
    else
      await webApi.fetch(
        `/v1/users/${user.id}/status`,
        v1.access.accessUserSchema,
        { method: "PUT", json: { ...rev, status: action } },
      );
    setConfirmAction(null);
    reload();
  }
  return (
    <fieldset disabled={disabled || task.busy} className="min-w-0">
      <section className="flex flex-col gap-4 border-t pt-6">
        <h2 className="font-sans text-lg font-semibold">
          {t("access.accountAccess")}
        </h2>
        {user.invitation ? (
          <p className="text-sm">
            {t("access.delivery")}:{" "}
            {t(`access.deliveryStates.${user.invitation.deliveryStatus}`)} ·{" "}
            {t("access.expires")}:{" "}
            {new Date(user.invitation.expiresAt).toLocaleString(locale)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <SaveButton
            variant="outline"
            disabled={
              !canInvite ||
              task.busy ||
              disabled ||
              user.loginStatus === "ACTIVE" ||
              user.loginStatus === "SUSPENDED"
            }
            onClick={() => void task.run(() => lifecycle("invite"))}
            {...formAction(
              "invite",
              { pending: task.busy, error: task.error },
              user.invitation ? t("access.resend") : t("access.invite"),
            )}
          />
          {canInvite && user.loginStatus === "INVITED" ? (
            <Button
              variant="outline"
              disabled={task.busy || disabled}
              onClick={() => setConfirmAction("cancelInvite")}
            >
              {t("access.cancelInvite")}
            </Button>
          ) : null}
          {canManageStatus && user.loginStatus === "ACTIVE" ? (
            <Button
              variant="outline"
              onClick={() => setConfirmAction("SUSPENDED")}
            >
              {t("access.suspend")}
            </Button>
          ) : null}
          {canManageStatus && user.loginStatus === "SUSPENDED" ? (
            <Button
              variant="outline"
              onClick={() => setConfirmAction("ACTIVE")}
            >
              {t("access.activate")}
            </Button>
          ) : null}
          {canManageStatus && user.loginStatus !== "DISABLED" ? (
            <Button
              variant="outline"
              onClick={() => setConfirmAction("DISABLED")}
            >
              {t("access.disable")}
            </Button>
          ) : null}
        </div>
        {superAdmin ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              {t("access.designationWarning")}
            </p>
            <Button variant="outline" onClick={() => setConfirmAction("super")}>
              {user.isSuperAdmin
                ? t("access.revokeSuper")
                : t("access.grantSuper")}
            </Button>
          </div>
        ) : null}
        {superAdmin && user.personId ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              {t("access.customerHelp")}
            </p>
            <Button
              variant="outline"
              onClick={() => setConfirmAction("customer")}
            >
              {user.portalEligible
                ? t("access.disableCustomer")
                : t("access.enableCustomer")}
            </Button>
          </div>
        ) : null}
        {confirmAction ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
            <span className="font-medium">
              {t(
                confirmAction === "super"
                  ? user.isSuperAdmin
                    ? "access.revokeSuper"
                    : "access.grantSuper"
                  : confirmAction === "customer"
                    ? user.portalEligible
                      ? "access.disableCustomer"
                      : "access.enableCustomer"
                    : confirmAction === "SUSPENDED"
                      ? "access.suspend"
                      : confirmAction === "ACTIVE"
                        ? "access.activate"
                        : confirmAction === "DISABLED"
                          ? "access.disable"
                          : "access.cancelInvite",
              )}
              : {user.email}
            </span>
            <SaveButton
              variant="destructive"
              disabled={task.busy || disabled}
              onClick={() => void task.run(() => lifecycle(confirmAction))}
              {...formAction(
                "confirm",
                { pending: task.busy, error: task.error },
                t("access.confirm"),
              )}
            />
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              {t("cancel")}
            </Button>
          </div>
        ) : null}
      </section>
      <Feedback error={task.error} />
    </fieldset>
  );
}
