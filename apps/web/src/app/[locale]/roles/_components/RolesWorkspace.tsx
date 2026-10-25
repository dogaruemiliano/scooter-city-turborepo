"use client";
import { useFormAction } from "@/lib/form/use-form-action";
import { SaveButton } from "@repo/ui/components/save-button";

import { useCallback, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import { v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  buttonVariants,
  ListLayout,
  ListItems,
  ListStatus,
} from "@repo/ui/components";
import { Card, CardContent, CardHeader } from "@repo/ui/components/card";
import { FormActions } from "@repo/ui/components/form-actions";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { webApi } from "@/lib/api";
import {
  Feedback,
  RemoteState,
  useRemote,
  useTask,
} from "@/components/WorkspaceForm";
import { useSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { AccessHistory } from "./AccessHistory";
import { RoleCard } from "./RoleCard";
import { AccessWorkspace } from "./AccessWorkspace";
import {
  PermissionDiff,
  PermissionEditor,
  type Grant,
} from "./permission-editor";

const profileIcons = {
  admin: ShieldCheck,
  mechanic: Wrench,
  customer: UserRound,
} as const;

function isBaseRole(role: v1.access.Role) {
  return v1.access.BASE_ROLE_SLUGS.some((slug) => role.slug === slug);
}

export function RolesWorkspace({ id }: { id?: string }) {
  const t = useTranslations("workspace");
  const shared = useTranslations("shared");
  const { user: actor } = useSession();
  const load = useCallback(
    () =>
      webApi.fetch("/v1/access/roles", v1.access.roleListSchema, {
        cache: "no-store",
      }),
    [],
  );
  const remote = useRemote(load);
  const roles = remote.data?.items ?? [];
  const role = roles.find(
    (item) => item.id === id && !item.archivedAt && isBaseRole(item),
  );
  return (
    <AccessWorkspace current="roles" hideTitle>
      {!remote.data ? (
        <RemoteState error={remote.error} retry={remote.reload} />
      ) : id && id !== "new" ? (
        <>
          <Link
            href="/roles"
            className={buttonVariants({
              variant: "ghost",
              className: "self-start text-muted-foreground",
            })}
          >
            <ArrowLeft aria-hidden="true" />
            {t("access.member.roles")}
          </Link>
          {role ? (
            <RoleForm
              key={`${role.id}-${role.revision}`}
              role={role}
              reload={remote.reload}
            />
          ) : (
            <Feedback error={t("access.member.roleUnavailable")} />
          )}
        </>
      ) : (
        <ListLayout aria-labelledby="role-library-title">
          <div className="flex flex-col gap-2">
            <h2
              id="role-library-title"
              className="font-sans text-lg font-semibold"
            >
              {t("access.member.roles")}
            </h2>
          </div>
          <ListStatus
            loading={remote.loading}
            error={remote.error}
            loadingLabel={shared("status.refreshing")}
            retryLabel={shared("actions.retry")}
            onRetry={remote.reload}
          />
          <ListItems
            items={["superAdmin", ...v1.access.BASE_ROLE_SLUGS] as const}
            getItemKey={(slug) => slug}
            renderItem={(slug) => {
              if (slug === "superAdmin")
                return (
                  <RoleCard
                    slug={slug}
                    title={t("access.member.roleNames.superAdmin")}
                    description={t("access.member.roleDescriptions.superAdmin")}
                    footer={
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {t("access.member.superRoleHelp")}
                      </p>
                    }
                  />
                );
              const profile = roles.find(
                (item) => item.slug === slug && !item.archivedAt,
              );
              return (
                <RoleCard
                  slug={slug}
                  title={t(`access.member.roleNames.${slug}`)}
                  description={t(`access.member.roleDescriptions.${slug}`)}
                  trailing={
                    profile ? (
                      <Badge variant="secondary">
                        {t("access.members")}: {profile.memberCount}
                      </Badge>
                    ) : undefined
                  }
                  footer={
                    profile ? (
                      <Link
                        href={`/roles/${profile.id}`}
                        aria-label={`${t(canAccess(actor, "roles.update") && (slug !== "admin" || actor?.isSuperAdmin) ? "access.member.editPermissions" : "access.member.viewPermissions")} · ${t(`access.member.roleNames.${slug}`)}`}
                        className={buttonVariants({
                          variant: "secondary",
                          className: "min-h-11 w-full justify-between",
                        })}
                      >
                        {t(
                          canAccess(actor, "roles.update") &&
                            (slug !== "admin" || actor?.isSuperAdmin)
                            ? "access.member.editPermissions"
                            : "access.member.viewPermissions",
                        )}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("access.member.roleUnavailable")}
                      </p>
                    )
                  }
                />
              );
            }}
          />
        </ListLayout>
      )}
    </AccessWorkspace>
  );
}

function RoleForm({
  role,
  reload,
}: {
  role: v1.access.Role;
  reload: () => void;
}) {
  const formAction = useFormAction();

  const t = useTranslations("workspace");
  const task = useTask();
  const { user: actor } = useSession();
  const readOnly =
    !canAccess(actor, "roles.update") ||
    (role.slug === "admin" && !actor?.isSuperAdmin);
  const [permissions, setPermissions] = useState<Grant[]>(role.permissions);
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof previewRole>
  > | null>(null);
  const [reviewedPayload, setReviewedPayload] = useState<string | null>(null);
  const payload = {
    name: role.name,
    description: role.description,
    permissions,
    expectedRevision: role.revision,
  };
  const previewCurrent = reviewedPayload === JSON.stringify(payload);
  const hasChanges =
    JSON.stringify(permissions) !== JSON.stringify(role.permissions);
  const slug = v1.access.BASE_ROLE_SLUGS.find((value) => value === role.slug)!;
  const Icon = profileIcons[slug];
  function previewRole() {
    return webApi.fetch(
      `/v1/access/roles/${role.id}/preview`,
      v1.access.rolePreviewSchema,
      {
        method: "POST",
        json: v1.access.updateRoleInputSchema.parse(payload),
      },
    );
  }
  return (
    <Card
      as="form"
      surface="raised"
      className="w-full max-w-(--breakpoint-lg) gap-6 overflow-visible"
      onSubmit={(event) => {
        event.preventDefault();
        if (readOnly) return;
        void task.run(
          async () => {
            if (!previewCurrent) {
              setPreview(await previewRole());
              setReviewedPayload(JSON.stringify(payload));
              return false;
            }
            await webApi.fetch(
              `/v1/access/roles/${role.id}`,
              v1.access.roleSchema,
              {
                method: "PUT",
                json: v1.access.updateRoleInputSchema.parse(payload),
              },
            );
            reload();
          },
          { successMessage: t("access.roleUpdated") },
        );
      }}
    >
      <CardHeader className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-sans text-lg font-semibold">
            {t(`access.member.roleNames.${slug}`)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(`access.member.roleDescriptions.${slug}`)}
          </p>
          <span className="text-xs text-muted-foreground">
            {t("access.members")}: {role.memberCount}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {readOnly ? (
          <p className="text-sm text-muted-foreground">
            {t(
              role.slug === "admin"
                ? "access.member.adminRoleReadOnly"
                : "access.member.roleReadOnly",
            )}
          </p>
        ) : null}
        <PermissionEditor
          value={permissions}
          onChange={setPermissions}
          disabled={task.busy || readOnly}
          canGrantPermission={(key, scopes) =>
            !!actor?.isSuperAdmin ||
            scopes.every((scope) => canAccess(actor, key, scope))
          }
          canEditPermission={(key) =>
            !!actor?.isSuperAdmin ||
            (!key.startsWith("users.") &&
              !key.startsWith("roles.") &&
              canAccess(actor, key))
          }
        />
        {preview && previewCurrent ? (
          <Card as="section" aria-label={t("access.review")}>
            <CardHeader>
              <h2 className="font-sans text-base font-semibold">
                {t("access.review")}
              </h2>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {t("access.members")}: {preview.memberCount}
              </p>
              {preview.affectedMembers.map((member) => (
                <div key={member.id} className="flex min-w-0 flex-col gap-2">
                  <span className="break-all text-sm font-semibold">
                    {member.email}
                  </span>
                  <PermissionDiff before={member.before} after={member.after} />
                  {member.missingPrerequisites.length ? (
                    <Feedback error={member.missingPrerequisites.join(", ")} />
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
        <Feedback error={task.error} />
      </CardContent>
      {!readOnly ? (
        <FormActions className="sticky bottom-0 z-raised bg-popover">
          <Button
            type="button"
            variant="secondary"
            disabled={task.busy || !hasChanges}
            onClick={() => {
              setPermissions(role.permissions);
              setPreview(null);
              setReviewedPayload(null);
            }}
          >
            {t("cancel")}
          </Button>
          <SaveButton
            type="submit"
            disabled={
              task.busy ||
              !hasChanges ||
              (previewCurrent &&
                !!preview?.affectedMembers.some(
                  (member) => member.missingPrerequisites.length,
                ))
            }
            {...formAction(
              previewCurrent ? "confirm" : "review",
              { pending: task.busy, error: task.error },
              previewCurrent ? t("access.confirm") : t("access.preview"),
            )}
          />
        </FormActions>
      ) : null}
      <CardContent>
        <details className="border-t pt-4">
          <summary className="cursor-pointer text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t("access.audit")}
          </summary>
          <AccessHistory path={`/v1/access/roles/${role.id}/audit-events`} />
        </details>
      </CardContent>
    </Card>
  );
}
