"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { v1 } from "@repo/api-shared";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  FieldLabel,
  Input,
} from "@repo/ui/components";
import { SearchField } from "@repo/ui/components/search-field";
import { NativeSelect } from "@repo/ui/components/native-select";
import { FormActions } from "@repo/ui/components/form-actions";
import {
  ChevronDown,
  Settings2,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { webApi } from "@/lib/api";
import {
  Feedback,
  RemoteState,
  useRemote,
  useTask,
} from "@/components/WorkspaceForm";
import { AccessWorkspace } from "../../roles/_components/AccessWorkspace";
import { AccessHistory } from "../../roles/_components/AccessHistory";
import {
  effectiveScopes,
  PermissionDiff,
  PermissionEditor,
  type Grant,
} from "../../roles/_components/permission-editor";
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
  const locale = useLocale();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [mobileDirectory, setMobileDirectory] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const deferredSearch = useDeferredValue(search);
  const load = useCallback(async () => {
    const [roles, users, user] = await Promise.all([
      webApi.fetch("/v1/access/roles", v1.access.roleListSchema, {
        cache: "no-store",
      }),
      webApi.fetch(
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
      setMobileDirectory(false);
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
    <AccessWorkspace current="directory" onNavigate={navigate}>
      {!remote.data ? (
        <RemoteState error={remote.error} retry={remote.reload} />
      ) : (
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-3 xl:grid-cols-4">
          <aside
            aria-label={t("access.member.directory")}
            className="flex min-w-0 flex-col gap-4 lg:col-span-1"
          >
            {id ? (
              <Button
                variant="outline"
                className="justify-between lg:hidden"
                aria-expanded={mobileDirectory}
                aria-controls="member-directory-list"
                onClick={() => setMobileDirectory((value) => !value)}
              >
                {t(
                  mobileDirectory
                    ? "access.member.hideDirectory"
                    : "access.member.changeMember",
                )}
                <ChevronDown
                  className={`size-4 ${mobileDirectory ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </Button>
            ) : null}
            <div
              id="member-directory-list"
              className={`${id && !mobileDirectory ? "hidden lg:flex" : "flex"} min-w-0 flex-col gap-4`}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-sans text-sm font-semibold">
                  {t("access.member.teamMembers", {
                    count: new Intl.NumberFormat(locale).format(
                      remote.data.users.total,
                    ),
                  })}
                </h2>
                <Link
                  href="/users/new"
                  onClick={(event) => navigate(event, "/users/new")}
                  className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-semibold text-link outline-none hover:text-link-hover focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserPlus className="size-4" aria-hidden="true" />
                  {t("access.member.add")}
                </Link>
              </div>
              <SearchField
                id="member-search"
                name="memberSearch"
                label={t("access.member.searchMembers")}
                placeholder={t("access.member.searchPlaceholder")}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                }}
              />
              {remote.error ? <Feedback error={remote.error} /> : null}
              <div className="flex flex-col gap-3 lg:max-h-(--container-access-directory) lg:overflow-y-auto lg:pr-1">
                {remote.data.users.items.map((user) => (
                  <Link
                    href={`/users/${user.id}`}
                    key={user.id}
                    aria-current={id === user.id ? "page" : undefined}
                    onClick={(event) => navigate(event, `/users/${user.id}`)}
                    className="group block min-w-0 rounded-xl [content-visibility:auto] outline-none focus-visible:ring-2 focus-visible:ring-ring minimal:rounded-none"
                  >
                    <Card
                      size="sm"
                      className={`transition-colors duration-fast group-hover:border-primary ${id === user.id ? "border-primary bg-popover" : "border-transparent"}`}
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
                ))}
                {remote.data.users.items.length === 0 ? (
                  <Card size="sm">
                    <CardContent className="text-muted-foreground">
                      {t("access.member.noMembers")}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
              {remote.data.users.total > 100 ? (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    disabled={!offset}
                    onClick={() =>
                      setOffset((value) => Math.max(0, value - 100))
                    }
                  >
                    {t("previous")}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={offset + 100 >= remote.data.users.total}
                    onClick={() => setOffset((value) => value + 100)}
                  >
                    {t("next")}
                  </Button>
                </div>
              ) : null}
            </div>
          </aside>
          <div className="min-w-0 lg:col-span-2 xl:col-span-3">
            {id ? (
              remote.data.requestedId === id ? (
                <UserForm
                  key={`${id}-${remote.data.user?.accessRevision}-${draftVersion}`}
                  user={remote.data.user}
                  roles={remote.data.roles}
                  onDirtyChange={setDirty}
                  onCancel={reset}
                  onNavigate={navigate}
                  reload={() => {
                    setDirty(false);
                    remote.reload();
                  }}
                />
              ) : (
                <RemoteState error={remote.error} retry={remote.reload} />
              )
            ) : (
              <Card as="section" surface="raised" className="py-16 text-center">
                <CardContent className="flex flex-col items-center gap-4">
                  <Users
                    className="size-10 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h2 className="font-sans text-xl font-semibold">
                    {t("access.member.selectMember")}
                  </h2>
                  <p className="max-w-(--breakpoint-sm) text-sm text-muted-foreground">
                    {t("access.member.selectMemberHelp")}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
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
                setMobileDirectory(false);
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
  onNavigate,
}: {
  user: v1.access.AccessUser | null;
  roles: v1.access.Role[];
  reload: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const t = useTranslations("workspace");
  const labels = useTranslations("access.permissions");
  const router = useRouter();
  const task = useTask();
  const [email, setEmail] = useState(user?.email ?? "");
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [roleIds, setRoleIds] = useState(
    user?.roles.map((role) => role.id) ?? [],
  );
  const [overrides, setOverrides] = useState<Grant[]>(user?.overrides ?? []);
  const [preview, setPreview] = useState<{
    before: v1.access.EffectiveScopes;
    after: v1.access.EffectiveScopes;
    missingPrerequisites: string[];
  } | null>(null);
  const [reviewed, setReviewed] = useState("");
  const [showAccount, setShowAccount] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const reviewRef = useRef<HTMLElement>(null);
  const selectedRoles = roles.filter((role) => roleIds.includes(role.id));
  const grants = {
    roles: selectedRoles.map(({ id, revision }) => ({ id, revision })),
    overrides,
  };
  const payload = user
    ? { ...grants, expectedRevision: user.accessRevision }
    : { ...grants, email, firstName, lastName };
  const previewCurrent = reviewed === JSON.stringify(payload);
  useEffect(() => {
    if (previewCurrent && preview) reviewRef.current?.focus();
  }, [previewCurrent, preview]);
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
  return (
    <Card
      as="section"
      surface="raised"
      className={`gap-0 py-0 ${showAccount || showHistory ? "" : "lg:max-h-(--container-access-editor)"}`}
      aria-labelledby="member-editor-title"
    >
      <CardHeader className="flex shrink-0 items-center gap-3 py-(--card-spacing)">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
          <Settings2 className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="member-editor-title" className="font-sans text-lg font-bold">
            {t(user ? "access.member.editPermissions" : "access.addUser")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("access.member.editorHelp")}
          </p>
        </div>
        <Link
          href="/users"
          onClick={(event) => onNavigate(event, "/users")}
          aria-label={t("access.member.closeEditor")}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </Link>
      </CardHeader>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
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
              return false;
            }
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
          });
        }}
      >
        <CardContent className="flex min-h-0 flex-col gap-6 pb-(--card-spacing) lg:overflow-y-auto">
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
              <FieldLabel htmlFor="base-role">
                {t("access.member.baseRole")}
              </FieldLabel>
              <NativeSelect
                id="base-role"
                name="baseRole"
                value={user?.isSuperAdmin ? "super-admin" : (roleIds[0] ?? "")}
                disabled={task.busy || user?.isSuperAdmin}
                onChange={(event) =>
                  setRoleIds(event.target.value ? [event.target.value] : [])
                }
              >
                {user?.isSuperAdmin ? (
                  <option value="super-admin">
                    {t("access.member.roleNames.superAdmin")}
                  </option>
                ) : null}
                <option value="">{t("access.member.noRole")}</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {t(`access.member.roleNames.${role.slug}`)}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                {user?.isSuperAdmin
                  ? t("access.member.superRoleHelp")
                  : selectedRoles[0]
                    ? t(
                        `access.member.roleDescriptions.${selectedRoles[0].slug}`,
                      )
                    : t("access.member.noRoleHelp")}
              </p>
            </Field>
          </div>
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
            <PermissionEditor
              value={overrides}
              onChange={setOverrides}
              roles={selectedRoles}
              disabled={task.busy}
            />
          )}
          {preview && previewCurrent ? (
            <section
              ref={reviewRef}
              tabIndex={-1}
              aria-label={t("access.review")}
              className="flex flex-col gap-3 border-t pt-4"
            >
              <h3 className="font-sans font-semibold">{t("access.review")}</h3>
              <PermissionDiff before={preview.before} after={preview.after} />
              {preview.missingPrerequisites.length ? (
                <Feedback
                  error={`${t("access.dependencies")}: ${preview.missingPrerequisites.map((key) => labels(key)).join(", ")}`}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("access.member.reviewHelp")}
                </p>
              )}
            </section>
          ) : null}
          <Feedback error={task.error} success={task.success} />
        </CardContent>
        {!user?.isSuperAdmin ? (
          <FormActions
            status={
              dirty ? t("access.member.unsaved") : t("access.member.upToDate")
            }
          >
            <Button
              type="button"
              variant="secondary"
              disabled={task.busy}
              onClick={onCancel}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                task.busy ||
                (previewCurrent && !!preview?.missingPrerequisites.length)
              }
            >
              {task.busy
                ? t("access.member.saving")
                : previewCurrent
                  ? t("access.confirm")
                  : t("access.preview")}
            </Button>
          </FormActions>
        ) : null}
      </form>
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
                  disabled={dirty}
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
