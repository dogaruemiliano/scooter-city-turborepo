"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useState,
  type MouseEvent,
} from "react";
import { v1 } from "@repo/api-shared";
import {
  Avatar,
  AvatarFallback,
  Badge,
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetContent,
  BottomSheetBody,
  BottomSheetFooter,
  buttonVariants,
  ListLayout,
  ListItems,
  ListEmpty,
  ListPagination,
  ListStatus,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  FieldLabel,
  Input,
  SheetSelect,
} from "@repo/ui/components";
import { SearchField } from "@repo/ui/components/search-field";
import { FormActions } from "@repo/ui/components/form-actions";
import { ChevronDown, ChevronRight, ShieldCheck, UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { webApi } from "@/lib/api";
import {
  Feedback,
  RemoteState,
  useRemote,
  useTask,
} from "@/components/WorkspaceForm";
import { RoleCard, roleCardSurface } from "../../roles/_components/RoleCard";
import { AccessWorkspace } from "../../roles/_components/AccessWorkspace";
import { AccessHistory } from "../../roles/_components/AccessHistory";
import {
  effectiveScopes,
  PermissionEditor,
  type Grant,
} from "../../roles/_components/permission-editor";
import { useSession } from "@/components/auth/SessionProvider";
import { canAccess, canManageUser } from "@/lib/access";
import { AccessReviewSheet } from "./AccessReviewSheet";
import { MemberAccountControls } from "./MemberAccountControls";

const baseSlugs = v1.access.BASE_ROLE_SLUGS;
function memberName(user: v1.access.AccessUser) {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
  );
}
function MemberAvatar({
  user,
  large = false,
}: {
  user: v1.access.AccessUser;
  large?: boolean;
}) {
  const initials =
    [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("") ||
    user.email.slice(0, 2);
  return (
    <Avatar aria-hidden="true" shape="square" size={large ? "xl" : "lg"}>
      <AvatarFallback>{initials.toLocaleUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

export function UsersWorkspace({ id }: { id?: string }) {
  const t = useTranslations("workspace");
  const shared = useTranslations("shared");
  const pageTitles = useTranslations("appShell.pages");
  const { user: actor } = useSession();
  const locale = useLocale();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const deferredSearch = useDeferredValue(search);
  const load = useCallback(async () => {
    const [roles, users, user] = await Promise.all([
      webApi.fetch("/v1/access/roles", v1.access.roleListSchema, {
        cache: "no-store",
      }),
      id
        ? Promise.resolve({ items: [], total: 0 })
        : webApi.fetch(
            `/v1/users?${new URLSearchParams({ search: deferredSearch, offset: String(offset) })}`,
            v1.access.accessUserListSchema,
            { cache: "no-store" },
          ),
      id && id !== "new"
        ? webApi.fetch(`/v1/users/${id}`, v1.access.accessUserSchema, {
            cache: "no-store",
          })
        : Promise.resolve(null),
    ]);
    return {
      roles: roles.items.filter(
        (role) =>
          !role.archivedAt && baseSlugs.some((slug) => slug === role.slug),
      ),
      users,
      user,
      requestedId: id,
    };
  }, [id, deferredSearch, offset]);
  const remote = useRemote(load);
  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (
      !dirty ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    setPendingHref(href);
  };
  const labelFor = (user: v1.access.AccessUser) =>
    user.isSuperAdmin
      ? t("access.member.roleNames.superAdmin")
      : user.roles.length
        ? user.roles
            .map((role) =>
              baseSlugs.some((slug) => slug === role.slug)
                ? t(`access.member.roleNames.${role.slug}`)
                : role.name,
            )
            .join(", ")
        : t("access.member.noRole");
  const reset = () => {
    setDirty(false);
    setDraftVersion((version) => version + 1);
  };
  return (
    <AccessWorkspace
      headerTitle={id === "new" ? pageTitles("newUser") : undefined}
      current="directory"
      onNavigate={navigate}
      editor={!!id}
      hideTitle
      hideTabs
    >
      {!remote.data ? (
        <RemoteState error={remote.error} retry={remote.reload} />
      ) : (
        <div
          data-slot="users-workspace-layout"
          className="flex min-w-0 flex-col gap-6"
        >
          {!id ? (
            <aside
              aria-label={t("access.member.directory")}
              className="flex min-w-0 flex-col gap-4"
            >
              <div
                id="member-directory-list"
                className="flex min-w-0 flex-col gap-4"
              >
                <ListLayout
                  action={
                    canAccess(actor, "users.invite") ? (
                      <Link
                        href="/users/new"
                        onClick={(event) => navigate(event, "/users/new")}
                        className={buttonVariants()}
                      >
                        <UserPlus aria-hidden="true" data-icon="inline-start" />
                        {t("access.member.add")}
                      </Link>
                    ) : undefined
                  }
                  search={
                    <SearchField
                      id="member-search"
                      name="memberSearch"
                      label={t("access.member.searchMembers")}
                      placeholder={t("access.member.searchPlaceholder")}
                      value={search}
                      clearLabel={shared("list.selectClearSearch")}
                      onClear={() => {
                        setSearch("");
                        setOffset(0);
                      }}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setOffset(0);
                      }}
                    />
                  }
                  summary={
                    <h2 className="font-sans text-sm font-semibold">
                      {t("access.member.teamMembers", {
                        count: new Intl.NumberFormat(locale).format(
                          remote.data.users.total,
                        ),
                      })}
                    </h2>
                  }
                  footer={
                    remote.data.users.total > 100 ? (
                      <ListPagination
                        canPrevious={offset > 0 && !remote.loading}
                        canNext={
                          offset + 100 < remote.data.users.total &&
                          !remote.loading
                        }
                        onPrevious={() =>
                          setOffset((value) => Math.max(0, value - 100))
                        }
                        onNext={() => setOffset((value) => value + 100)}
                        previousLabel={t("previous")}
                        nextLabel={t("next")}
                        label={shared("list.pagination")}
                      />
                    ) : null
                  }
                >
                  <ListStatus
                    loading={remote.loading}
                    error={remote.error}
                    loadingLabel={shared("status.refreshing")}
                    retryLabel={shared("actions.retry")}
                    onRetry={remote.reload}
                  />
                  <ListItems
                    items={remote.data.users.items}
                    getItemKey={(user) => user.id}
                    empty={
                      <ListEmpty>{t("access.member.noMembers")}</ListEmpty>
                    }
                    renderItem={(user) => (
                      <Link
                        href={`/users/${user.id}`}
                        aria-current={id === user.id ? "page" : undefined}
                        onClick={(event) =>
                          navigate(event, `/users/${user.id}`)
                        }
                        className="group block min-w-0 rounded-xl [content-visibility:auto] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Card
                          size="sm"
                          border={id === user.id ? "primary" : undefined}
                          className={`transition-colors duration-fast group-hover:border-primary ${id === user.id ? "bg-popover" : ""}`}
                        >
                          <CardContent className="flex min-w-0 items-center gap-3">
                            <MemberAvatar user={user} />
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              <span
                                className={`truncate text-sm font-semibold ${id === user.id ? "text-link" : "text-foreground"}`}
                              >
                                {memberName(user)}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {user.email}
                              </span>
                              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">
                                  {labelFor(user)}
                                </span>
                                <span aria-hidden="true">·</span>
                                {t(`access.${user.loginStatus.toLowerCase()}`)}
                              </span>
                            </span>
                          </CardContent>
                        </Card>
                      </Link>
                    )}
                  />
                </ListLayout>
              </div>
            </aside>
          ) : null}
          {id ? (
            <div className="flex min-w-0 flex-col gap-4">
              {remote.data.requestedId === id ? (
                <UserForm
                  key={`${id}-${remote.data.user?.accessRevision}-${draftVersion}`}
                  user={remote.data.user}
                  roles={remote.data.roles}
                  onDirtyChange={setDirty}
                  onCancel={reset}
                  reload={() => {
                    setDirty(false);
                    remote.reload();
                  }}
                />
              ) : (
                <RemoteState error={remote.error} retry={remote.reload} />
              )}
            </div>
          ) : null}
        </div>
      )}
      <Dialog
        open={!!pendingHref}
        onOpenChange={(open) => {
          if (!open) setPendingHref(null);
        }}
      >
        <DialogContent
          className="access-workspace font-body"
          showCloseButton={false}
        >
          <DialogTitle>{t("access.member.unsavedTitle")}</DialogTitle>
          <DialogDescription>
            {t("access.member.unsavedHelp")}
          </DialogDescription>
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={() => setPendingHref(null)}>
              {t("access.member.keepEditing")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const destination = pendingHref!;
                setPendingHref(null);
                setDirty(false);
                router.push(destination);
              }}
            >
              {t("access.member.discard")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AccessWorkspace>
  );
}

function UserForm({
  user,
  roles,
  reload,
  onDirtyChange,
  onCancel,
}: {
  user: v1.access.AccessUser | null;
  roles: v1.access.Role[];
  reload: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("workspace");
  const { user: actor } = useSession();
  const manageable = canManageUser(actor, user);
  const canAssign = manageable && canAccess(actor, "users.roles.update");
  const canCustomize =
    manageable && canAccess(actor, "users.permissions.update");
  const canSubmit = user
    ? canAssign || canCustomize
    : canAccess(actor, "users.invite");

  const router = useRouter();
  const task = useTask();
  const [email, setEmail] = useState(user?.email ?? "");
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [roleIds, setRoleIds] = useState(
    user?.roles.map((role) => role.id) ?? [],
  );
  const [overrides, setOverrides] = useState<Grant[]>(user?.overrides ?? []);
  const [showPermissions, setShowPermissions] = useState(false);
  const permissionText = useTranslations("access.editor");
  const [preview, setPreview] = useState<{
    before: v1.access.EffectiveScopes;
    after: v1.access.EffectiveScopes;
    missingPrerequisites: string[];
  } | null>(null);
  const [reviewed, setReviewed] = useState("");
  const [showAccount, setShowAccount] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const formId = useId();
  const [showReview, setShowReview] = useState(false);
  const selectedRoles = roles.filter((role) => roleIds.includes(role.id));
  const roleOptions = [
    {
      value: "none",
      slug: "none",
      label: t("access.member.noRole"),
      description: t("access.member.noRoleHelp"),
    },
    ...roles
      .filter(
        (role) =>
          actor?.isSuperAdmin ||
          role.slug !== "admin" ||
          user?.roles.some((r) => r.id === role.id),
      )
      .map((role) => ({
        value: role.id,
        slug: role.slug,
        label: t(`access.member.roleNames.${role.slug}`),
        description: t(`access.member.roleDescriptions.${role.slug}`),
      })),
  ];
  const selectedRole = user?.isSuperAdmin
    ? {
        value: "super-admin",
        slug: "superAdmin",
        label: t("access.member.roleNames.superAdmin"),
        description: t("access.member.superRoleHelp"),
      }
    : (roleOptions.find((role) => role.value === roleIds[0]) ?? roleOptions[0]);

  const grants = {
    roles: selectedRoles.map(({ id, revision }) => ({ id, revision })),
    overrides,
  };
  const payload = user
    ? { ...grants, expectedRevision: user.accessRevision }
    : { ...grants, email, firstName, lastName };
  const previewCurrent = reviewed === JSON.stringify(payload);
  const dirty =
    JSON.stringify(roleIds) !==
      JSON.stringify(user?.roles.map((role) => role.id) ?? []) ||
    JSON.stringify(overrides) !== JSON.stringify(user?.overrides ?? []) ||
    (!user && !!(email || firstName || lastName));
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const saveAccess = () => {
    if (
      !canSubmit ||
      !previewCurrent ||
      !preview ||
      preview.missingPrerequisites.length
    )
      return;
    void task.run(async () => {
      const saved = await webApi.fetch(
        user ? `/v1/users/${user.id}/access` : "/v1/users",
        v1.access.accessUserSchema,
        {
          method: user ? "PUT" : "POST",
          json: user
            ? v1.access.userAccessInputSchema.parse(payload)
            : v1.access.createUserInputSchema.parse(payload),
        },
      );
      onDirtyChange(false);
      if (!user) router.replace(`/users/${saved.id}`);
      else reload();
      setShowReview(false);
      setShowPermissions(false);
    });
  };
  const reviewSheet = (
    <AccessReviewSheet
      open={showReview}
      onOpenChange={setShowReview}
      before={preview?.before ?? {}}
      after={preview?.after ?? {}}
      beforeRoles={user?.roles ?? []}
      afterRoles={selectedRoles}
      beforeOverrides={user?.overrides ?? []}
      afterOverrides={overrides}
      member={user ? memberName(user) : email}
      missing={preview?.missingPrerequisites ?? []}
      busy={task.busy}
      stale={!previewCurrent}
      error={task.error}
      onConfirm={saveAccess}
    />
  );
  return (
    <Card
      as="section"
      surface="raised"
      className="gap-0 py-0"
      aria-label={t(user ? "access.member.editPermissions" : "access.addUser")}
    >
      <form
        id={formId}
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          void task.run(async () => {
            if (!previewCurrent) {
              if (user)
                setPreview(
                  await webApi.fetch(
                    `/v1/users/${user.id}/access/preview`,
                    v1.access.accessPreviewSchema,
                    {
                      method: "POST",
                      json: v1.access.userAccessInputSchema.parse(payload),
                    },
                  ),
                );
              else {
                v1.access.createUserInputSchema.parse(payload);
                const after = effectiveScopes(selectedRoles, overrides);
                const missing = v1.access.permissionCatalog.flatMap(
                  (permission) =>
                    after[permission.key]?.length
                      ? [
                          ...permission.prerequisites.filter(
                            (key) => !after[key]?.length,
                          ),
                          ...permission.scopePrerequisites
                            .filter(
                              (requirement) =>
                                !after[requirement.key]?.some(
                                  (scope) =>
                                    scope === "ALL" ||
                                    requirement.anyOf.includes(scope),
                                ),
                            )
                            .map((requirement) => requirement.key),
                        ]
                      : [],
                );
                setPreview({
                  before: {},
                  after,
                  missingPrerequisites: [...new Set(missing)],
                });
              }
              setReviewed(JSON.stringify(payload));
              setShowReview(true);
              return false;
            }
            setShowReview(true);
            return false;
          });
        }}
      >
        <CardContent className="flex min-h-0 flex-col gap-6 py-(--card-spacing)">
          <div className="grid min-w-0 gap-5 border-b pb-6 md:grid-cols-2">
            {user ? (
              <div className="flex min-w-0 items-center gap-3">
                <MemberAvatar user={user} large />
                <div className="min-w-0">
                  <h3 className="truncate font-sans font-semibold">
                    {memberName(user)}
                  </h3>
                  <p className="truncate text-sm text-muted-foreground">
                    {user.email}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`access.${user.loginStatus.toLowerCase()}`)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor="user-email">{t("email")}</FieldLabel>
                  <Input
                    id="user-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    required
                    disabled={task.busy}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="user-first">
                      {t("firstName")}
                    </FieldLabel>
                    <Input
                      id="user-first"
                      name="given-name"
                      autoComplete="given-name"
                      disabled={task.busy}
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="user-last">{t("lastName")}</FieldLabel>
                    <Input
                      id="user-last"
                      name="family-name"
                      autoComplete="family-name"
                      disabled={task.busy}
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                    />
                  </Field>
                </div>
              </div>
            )}
            <Field>
              <FieldLabel className="sr-only" htmlFor="base-role">
                {t("access.member.baseRole")}
              </FieldLabel>
              <SheetSelect
                triggerVariant="card"
                id="base-role"
                label={t("access.member.baseRole")}
                value={selectedRole.value}
                disabled={task.busy || !canAssign || user?.isSuperAdmin}
                options={roleOptions}
                onValueChange={(value) =>
                  setRoleIds(value === "none" ? [] : [value])
                }
                className={roleCardSurface}
                optionClassName={roleCardSurface}
                closeLabel={t("cancel")}
                searchPlaceholder={t("access.member.searchRoles")}
                clearSearchLabel={t("access.member.clearRoleSearch")}
                emptyMessage={t("access.member.noMatchingRoles")}
                triggerContent={
                  <>
                    <RoleCard
                      contentOnly
                      title={selectedRole.label}
                      description={selectedRole.description}
                      slug={selectedRole.slug}
                    />
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </>
                }
                renderOption={(option) => {
                  const role = roleOptions.find(
                    (role) => role.value === option.value,
                  )!;
                  return (
                    <RoleCard
                      contentOnly
                      title={role.label}
                      description={role.description}
                      slug={role.slug}
                    />
                  );
                }}
              />
              {user?.isSuperAdmin ? (
                <div className="flex items-start gap-3 py-4">
                  <ShieldCheck
                    className="size-6 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("access.editor.superAdminHelp")}
                  </p>
                </div>
              ) : (
                <BottomSheet
                  open={showPermissions}
                  onOpenChange={setShowPermissions}
                >
                  <BottomSheetTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-between gap-3 text-left"
                      />
                    }
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span>{permissionText("customizePermissions")}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {overrides.length
                          ? permissionText("userOverrideSummary", {
                              allowed: overrides.filter(
                                (grant) => grant.scopes.length > 0,
                              ).length,
                              denied: overrides.filter(
                                (grant) => grant.scopes.length === 0,
                              ).length,
                            })
                          : permissionText("roleDefaults")}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </BottomSheetTrigger>
                  <BottomSheetContent
                    aria-label={permissionText("customizePermissions")}
                  >
                    <BottomSheetBody className="pt-0">
                      <PermissionEditor
                        stickyTabs
                        value={overrides}
                        onChange={setOverrides}
                        roles={selectedRoles}
                        disabled={task.busy || !canCustomize}
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
                    </BottomSheetBody>
                    <BottomSheetFooter>
                      <Feedback error={!showReview ? task.error : null} />
                      <Button
                        type="submit"
                        form={formId}
                        disabled={task.busy || !canSubmit || !dirty}
                      >
                        {task.busy
                          ? t("access.member.saving")
                          : t("access.preview")}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={task.busy}
                        onClick={() => setShowPermissions(false)}
                      >
                        {t("done")}
                      </Button>
                      {dirty && user ? (
                        <Button
                          type="button"
                          variant="text"
                          disabled={task.busy}
                          onClick={onCancel}
                        >
                          {t("access.member.discard")}
                        </Button>
                      ) : null}
                    </BottomSheetFooter>
                    {showPermissions ? reviewSheet : null}
                  </BottomSheetContent>
                </BottomSheet>
              )}
            </Field>
          </div>
          <Feedback error={task.error} success={task.success} />
        </CardContent>
        {!user?.isSuperAdmin && canSubmit ? (
          user ? (
            <CardContent className="pb-(--card-spacing)">
              <Button type="submit" disabled={task.busy || !dirty}>
                {task.busy ? t("access.member.saving") : t("access.preview")}
              </Button>
            </CardContent>
          ) : (
            <FormActions>
              <Button
                type="button"
                variant="secondary"
                disabled={task.busy}
                onClick={onCancel}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={task.busy || !dirty}>
                {task.busy ? t("access.member.saving") : t("access.preview")}
              </Button>
            </FormActions>
          )
        ) : null}
      </form>
      {!showPermissions ? reviewSheet : null}
      {user ? (
        <CardContent className="flex shrink-0 flex-col gap-4 border-t py-(--card-spacing)">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showAccount}
              aria-controls="member-account"
              onClick={() => setShowAccount((value) => !value)}
            >
              {t("access.accountAccess")}
              <ChevronDown
                className={`size-4 ${showAccount ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showHistory}
              aria-controls="member-history"
              onClick={() => setShowHistory((value) => !value)}
            >
              {t("access.audit")}
              <ChevronDown
                className={`size-4 ${showHistory ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </Button>
            {user.personId ? (
              <Badge variant="secondary">
                {t(
                  user.portalEligible
                    ? "access.member.portalOn"
                    : "access.member.portalOff",
                )}
              </Badge>
            ) : null}
          </div>
          <div id="member-account" hidden={!showAccount}>
            {showAccount ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t(
                    dirty
                      ? "access.member.saveBeforeAccount"
                      : "access.member.accountHelp",
                  )}
                </p>
                <MemberAccountControls
                  user={user}
                  reload={reload}
                  disabled={dirty || !manageable}
                  canInvite={canAccess(actor, "users.invite")}
                  canManageStatus={canAccess(actor, "users.status.update")}
                  superAdmin={!!actor?.isSuperAdmin}
                />
              </>
            ) : null}
          </div>
          <div id="member-history" hidden={!showHistory}>
            {showHistory ? (
              <AccessHistory path={`/v1/users/${user.id}/audit-events`} />
            ) : null}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
