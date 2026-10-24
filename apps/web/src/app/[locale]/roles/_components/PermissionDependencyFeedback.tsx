"use client";
import { useFormAction } from "@/lib/form/use-form-action";
import { SaveButton } from "@repo/ui/components/save-button";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import type { PermissionChange } from "../_lib/permission-dependencies";

export function PermissionDependencyNotice({
  changes,
  blocked,
  denied,
  disabled,
  onEnable,
}: {
  changes: PermissionChange[];
  blocked: v1.access.PermissionKey[];
  denied: v1.access.PermissionKey[];
  disabled: boolean;
  onEnable: () => void;
}) {
  const t = useTranslations("access.editor.dependenciesUi");
  const labels = useTranslations("access.permissions");
  const scopeText = useTranslations("access.editor.scopes");
  return (
    <Alert variant="warning" className="text-warning-text">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{t("requiredTitle")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 text-warning-text">
        <ul className="flex flex-col gap-1">
          {changes.map((change) => (
            <li key={change.permissionKey}>
              <span className="font-medium">
                {labels(change.permissionKey)}
              </span>
              {` · ${change.scopes.map((scope) => scopeText(scope)).join(" + ")}`}
              {denied.includes(change.permissionKey)
                ? ` · ${t("replacesDeny")}`
                : ""}
            </li>
          ))}
        </ul>
        {blocked.length ? (
          <p>
            {t("blocked", {
              permissions: blocked.map((key) => labels(key)).join(", "),
            })}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={disabled || blocked.length > 0}
          onClick={onEnable}
        >
          {t("enableRequired")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function PermissionDependencyDialog({
  change,
  dependents,
  blocked,
  disabled,
  userOverrides,
  onConfirm,
  onCancel,
}: {
  change: {
    permissionKey: v1.access.PermissionKey;
    scopes: v1.access.PermissionScope[];
  } | null;
  dependents: PermissionChange[];
  blocked: v1.access.PermissionKey[];
  disabled: boolean;
  userOverrides: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const formAction = useFormAction();

  const t = useTranslations("access.editor.dependenciesUi");
  const labels = useTranslations("access.permissions");
  const editorText = useTranslations("access.editor");
  return (
    <Dialog
      open={!!change}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-var(--spacing-12))] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("disableTitle")}</DialogTitle>
          <DialogDescription>
            {change
              ? t("disableHelp", { permission: labels(change.permissionKey) })
              : ""}
          </DialogDescription>
        </DialogHeader>
        {change ? (
          <p className="text-sm">
            <span className="font-medium">{editorText("scope")}: </span>
            {change.scopes.length
              ? change.scopes
                  .map((scope) => editorText(`scopes.${scope}`))
                  .join(" + ")
              : editorText("noAccess")}
          </p>
        ) : null}
        <ul className="flex list-disc flex-col gap-2 pl-4 text-sm">
          {dependents.map(({ permissionKey }) => (
            <li key={permissionKey}>{labels(permissionKey)}</li>
          ))}
        </ul>
        {userOverrides ? (
          <p className="text-sm text-muted-foreground">
            {t("inheritedDenials")}
          </p>
        ) : null}
        {blocked.length ? (
          <Alert variant="warning">
            <AlertDescription>
              {t("blocked", {
                permissions: blocked.map((key) => labels(key)).join(", "),
              })}
            </AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("keepUnchanged")}
          </Button>
          <SaveButton
            type="button"
            variant="destructive"
            disabled={disabled || blocked.length > 0}
            onClick={onConfirm}
            {...formAction(
              "confirm",
              { pending: false },
              change?.scopes.length
                ? t("applyChanges")
                : t("disableCount", { count: dependents.length + 1 }),
            )}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
