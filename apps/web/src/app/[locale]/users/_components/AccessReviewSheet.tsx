"use client";
import { useFormAction } from "@/lib/form/use-form-action";
import { SaveButton } from "@repo/ui/components/save-button";

import { v1 } from "@repo/api-shared";
import {
  Badge,
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  Button,
} from "@repo/ui/components";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Grant } from "../../roles/_components/permission-editor";

const sameScopes = (a: readonly string[] = [], b: readonly string[] = []) =>
  [...a].sort().join(",") === [...b].sort().join(",");

export function accessChangeTone(
  key: string,
  before: readonly string[] = [],
  after: readonly string[] = [],
) {
  if (!after.length || key.startsWith("users.") || key.startsWith("roles."))
    return "destructive" as const;
  if (before.length || after.includes("ALL")) return "warning" as const;
  return "success" as const;
}

type Role = Pick<v1.access.Role, "id" | "slug" | "name">;

export function AccessReviewSheet({
  open,
  onOpenChange,
  before,
  after,
  beforeRoles,
  afterRoles,
  beforeOverrides,
  afterOverrides,
  member,
  missing,
  busy,
  stale,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  before: v1.access.EffectiveScopes;
  after: v1.access.EffectiveScopes;
  beforeRoles: Role[];
  afterRoles: Role[];
  beforeOverrides: Grant[];
  afterOverrides: Grant[];
  member: string;
  missing: string[];
  busy: boolean;
  stale: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const formAction = useFormAction();

  const t = useTranslations("access.editor.review");
  const workspace = useTranslations("workspace");
  const editor = useTranslations("access.editor");
  const labels = useTranslations("access.permissions");
  const roleChanged =
    beforeRoles
      .map((r) => r.id)
      .sort()
      .join(",") !==
    afterRoles
      .map((r) => r.id)
      .sort()
      .join(",");
  const effective = v1.access.permissionCatalog.filter(
    ({ key }) => !sameScopes(before[key], after[key]),
  );
  const overrides = v1.access.permissionCatalog.filter(({ key }) => {
    const old = beforeOverrides.find((g) => g.permissionKey === key);
    const next = afterOverrides.find((g) => g.permissionKey === key);
    return (
      Boolean(old) !== Boolean(next) ||
      !sameScopes(old?.scopes, next?.scopes) ||
      (old?.reason ?? "") !== (next?.reason ?? "")
    );
  });
  const roleRisk =
    roleChanged &&
    (afterRoles.some((r) => r.slug === "admin") || !afterRoles.length);
  const overrideRisk = overrides.some(({ key }) => {
    const next = afterOverrides.find((grant) => grant.permissionKey === key);
    return (
      next &&
      (!next.scopes.length ||
        key.startsWith("users.") ||
        key.startsWith("roles."))
    );
  });
  const destructive =
    overrideRisk ||
    roleRisk ||
    effective.some(
      ({ key }) =>
        accessChangeTone(key, before[key], after[key]) === "destructive",
    );
  const warning = effective.some(
    ({ key }) => accessChangeTone(key, before[key], after[key]) === "warning",
  );
  const scopes = (value: readonly v1.access.PermissionScope[] = []) =>
    value.length
      ? value.map((scope) => workspace(`access.scopes.${scope}`)).join(", ")
      : workspace("none");
  const roleNames = (value: Role[]) =>
    value.length
      ? value
          .map((role) => workspace(`access.member.roleNames.${role.slug}`))
          .join(", ")
      : workspace("access.member.noRole");
  const overrideText = (grant: Grant | undefined) =>
    !grant
      ? editor("modes.default")
      : !grant.scopes.length
        ? editor("modes.deny")
        : scopes(grant.scopes);
  const change = (old: string, next: string) => (
    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-sm">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{t("before")}</p>
        <p className="mt-1 wrap-anywhere text-muted-foreground">{old}</p>
      </div>
      <ArrowRight
        aria-hidden="true"
        className="mt-1 size-4 text-muted-foreground"
      />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{t("after")}</p>
        <p className="mt-1 font-medium wrap-anywhere">{next}</p>
      </div>
    </div>
  );
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} dismissible={!busy}>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>{workspace("access.review")}</BottomSheetTitle>
          <BottomSheetDescription>{member}</BottomSheetDescription>
        </BottomSheetHeader>
        <BottomSheetBody>
          <p className="text-sm text-muted-foreground">
            {workspace("access.member.reviewHelp")}
          </p>
          {destructive || warning ? (
            <div
              className={`flex items-start gap-3 rounded-lg p-3 text-sm ${destructive ? "bg-destructive-subtle text-destructive" : "bg-warning-subtle text-warning"}`}
            >
              <ShieldAlert aria-hidden="true" className="size-5 shrink-0" />
              <p>{t(destructive ? "dangerHelp" : "expandedHelp")}</p>
            </div>
          ) : null}
          {roleChanged ? (
            <section className="border-b border-border pb-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {workspace("access.member.baseRole")}
                </h3>
                {roleRisk ? (
                  <Badge variant="destructive">{t("sensitive")}</Badge>
                ) : null}
              </div>
              {change(roleNames(beforeRoles), roleNames(afterRoles))}
            </section>
          ) : null}
          {overrides.length ? (
            <section>
              <h3 className="text-sm font-semibold">
                {editor("personalizedPermissions")}
              </h3>
              <ul className="mt-2 divide-y divide-border">
                {overrides.map(({ key }) => {
                  const old = beforeOverrides.find(
                    (g) => g.permissionKey === key,
                  );
                  const next = afterOverrides.find(
                    (g) => g.permissionKey === key,
                  );
                  return (
                    <li key={key} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">{labels(key)}</p>
                        <Badge
                          variant={
                            next && !next.scopes.length
                              ? "destructive"
                              : "warning"
                          }
                        >
                          {next && !next.scopes.length
                            ? editor("modes.deny")
                            : t("changed")}
                        </Badge>
                      </div>
                      {change(overrideText(old), overrideText(next))}
                      {next?.reason ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {next.reason}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {effective.length ? (
            <section>
              <h3 className="text-sm font-semibold">{t("effective")}</h3>
              <ul className="mt-2 divide-y divide-border">
                {effective.map(({ key }) => {
                  const tone = accessChangeTone(key, before[key], after[key]);
                  const label = !after[key]?.length
                    ? "removed"
                    : tone === "destructive"
                      ? "sensitive"
                      : tone === "warning"
                        ? "changed"
                        : "added";
                  return (
                    <li key={key} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">{labels(key)}</p>
                        <Badge variant={tone}>{t(label)}</Badge>
                      </div>
                      {change(scopes(before[key]), scopes(after[key]))}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {!roleChanged && !overrides.length && !effective.length ? (
            <p className="text-sm text-muted-foreground">{t("noChanges")}</p>
          ) : null}
          {missing.length ? (
            <p role="alert" className="text-sm text-destructive">
              {workspace("access.dependencies")}:{" "}
              {missing.map((key) => labels(key)).join(", ")}
            </p>
          ) : null}
          {stale ? (
            <p role="alert" className="text-sm text-destructive">
              {t("stale")}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </BottomSheetBody>
        <BottomSheetFooter>
          <SaveButton
            type="button"
            variant={
              destructive ? "destructive" : warning ? "warning" : "default"
            }
            disabled={busy || stale || !!missing.length}
            onClick={onConfirm}
            {...formAction(
              "confirm",
              { pending: busy, error: error },
              workspace("access.confirm"),
            )}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {workspace("access.member.keepEditing")}
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}
