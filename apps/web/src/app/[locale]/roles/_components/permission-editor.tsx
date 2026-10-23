"use client";

import { useId, useState } from "react";
import {
  Banknote,
  CalendarDays,
  ChevronDown,
  Info,
  ListFilter,
  Monitor,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import { v1 } from "@repo/api-shared";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { ScopePicker } from "./ScopePicker";
import {
  PermissionDependencyNotice,
  PermissionDependencyDialog,
} from "./PermissionDependencyFeedback";
import {
  planRequiredPermissions,
  planDependentDisables,
} from "../_lib/permission-dependencies";
import { SearchField } from "@repo/ui/components/search-field";
import { SegmentedRadioGroup } from "@repo/ui/components/segmented-radio-group";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { useTranslations } from "next-intl";

import {
  permissionActions,
  permissionActionKeys,
} from "../_lib/permission-presentation";

const permissionGroups = [
  { key: "administration", icon: ShieldCheck, prefixes: ["users.", "roles."] },
  {
    key: "fleet",
    icon: Truck,
    prefixes: [
      "scooters.",
      "scooter_documents.",
      "scooter_brands.",
      "vehicle_civ.",
    ],
  },
  { key: "service", icon: Wrench, prefixes: ["problems."] },
  { key: "rentals", icon: CalendarDays, prefixes: ["rentals."] },
  { key: "people", icon: Users, prefixes: ["persons.", "person_documents."] },
  { key: "finance", icon: Banknote, prefixes: ["finance."] },
  { key: "client", icon: Monitor, prefixes: ["portal."] },
] as const;

const searchable = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();

export type Grant = {
  permissionKey: v1.access.PermissionKey;
  scopes: v1.access.PermissionScope[];
  reason?: string | null;
};
export function normalizeScopes(
  scopes: readonly v1.access.PermissionScope[],
): v1.access.PermissionScope[] {
  return scopes.includes("ALL")
    ? ["ALL"]
    : v1.access.PERMISSION_SCOPES.filter((scope) => scopes.includes(scope));
}
export function inheritedScopes(
  roles: v1.access.Role[],
  key: string,
): v1.access.PermissionScope[] {
  return normalizeScopes(
    roles.flatMap((role) =>
      role.permissions
        .filter((grant) => grant.permissionKey === key)
        .flatMap((grant) => grant.scopes),
    ),
  );
}
export function effectiveScopes(
  roles: v1.access.Role[],
  overrides: Grant[],
): v1.access.EffectiveScopes {
  return Object.fromEntries(
    v1.access.permissionCatalog.map((permission) => [
      permission.key,
      overrides.find((row) => row.permissionKey === permission.key)?.scopes ??
        inheritedScopes(roles, permission.key),
    ]),
  );
}

type PermissionMode = "allow" | "default" | "deny";

/** Every dropdown option is a nonempty replacement; ALL never combines. */
function scopeOptions(scopes: readonly v1.access.PermissionScope[]) {
  const narrow = v1.access.PERMISSION_SCOPES.filter(
    (scope) => scope !== "ALL" && scopes.includes(scope),
  );
  const options: v1.access.PermissionScope[][] = narrow.map((scope) => [scope]);
  if (narrow.includes("ASSIGNED") && narrow.includes("AVAILABLE"))
    options.push(["ASSIGNED", "AVAILABLE"]);
  if (scopes.includes("ALL")) options.push(["ALL"]);
  return options;
}

export function PermissionEditor({
  value,
  onChange,
  roles,
  disabled,
  canEditPermission,
  canGrantPermission,
  stickyTabs = false,
}: {
  value: Grant[];
  onChange: (value: Grant[]) => void;
  roles?: v1.access.Role[];
  disabled?: boolean;
  canEditPermission?: (key: string) => boolean;
  canGrantPermission?: (
    key: string,
    scopes: v1.access.PermissionScope[],
  ) => boolean;
  stickyTabs?: boolean;
}) {
  const t = useTranslations("access.editor");
  const labels = useTranslations("access.permissions");
  const descriptions = useTranslations("access.descriptions");
  const id = useId();
  const [search, setSearch] = useState("");
  const [customFilter, setOnlyCustom] = useState(false);
  const onlyCustom = customFilter && value.length > 0;
  const [activeGroup, setActiveGroup] = useState<string>(() =>
    roles?.some((role) => role.slug === "mechanic") ? "service" : "fleet",
  );
  const [expandedDetails, setExpandedDetails] = useState<string[]>([]);
  const query = searchable(search.trim());
  const isUser = roles !== undefined;
  const grants = new Map(value.map((grant) => [grant.permissionKey, grant]));
  const [pendingChange, setPendingChange] = useState<{
    permissionKey: v1.access.PermissionKey;
    scopes: v1.access.PermissionScope[] | null;
    reason?: string | null;
  } | null>(null);
  const [dependencyFeedback, setDependencyFeedback] = useState("");
  const currentScopes = effectiveScopes(roles ?? [], value);
  const editable = (key: v1.access.PermissionKey) =>
    !disabled && canEditPermission?.(key) !== false;
  const canApplyGrant = (change: {
    permissionKey: v1.access.PermissionKey;
    scopes: v1.access.PermissionScope[];
  }) =>
    editable(change.permissionKey) &&
    (!change.scopes.length ||
      canGrantPermission?.(change.permissionKey, change.scopes) !== false);
  const applyChanges = (
    changes: {
      permissionKey: v1.access.PermissionKey;
      scopes: v1.access.PermissionScope[] | null;
      reason?: string | null;
    }[],
  ) => {
    const result = new Map(value.map((grant) => [grant.permissionKey, grant]));
    for (const change of changes) {
      if (change.scopes === null || (!isUser && !change.scopes.length))
        result.delete(change.permissionKey);
      else
        result.set(change.permissionKey, {
          permissionKey: change.permissionKey,
          scopes: normalizeScopes(change.scopes),
          reason:
            change.reason !== undefined
              ? change.reason
              : result.get(change.permissionKey)?.reason,
        });
    }
    return [...result.values()];
  };
  const impactFor = (change: NonNullable<typeof pendingChange>) => {
    const next = applyChanges([change]);
    const after = effectiveScopes(roles ?? [], next);
    return {
      after,
      dependents: planDependentDisables(
        change.permissionKey,
        currentScopes,
        after,
      ),
    };
  };
  const replace = (
    key: v1.access.PermissionKey,
    scopes: v1.access.PermissionScope[] | null,
    reason?: string | null,
  ) => {
    if (!editable(key)) return;
    const change = { permissionKey: key, scopes, reason };
    const impact = impactFor(change);
    if (impact.dependents.length) {
      setPendingChange(change);
      return;
    }
    setDependencyFeedback("");
    onChange(applyChanges([change]));
  };
  const enableRequirements = (key: v1.access.PermissionKey) => {
    const plan = planRequiredPermissions(key, currentScopes);
    if (
      !editable(key) ||
      plan.unresolved.length ||
      plan.changes.some((change) => !canApplyGrant(change))
    )
      return;
    onChange(applyChanges(plan.changes));
    setDependencyFeedback(
      t("dependenciesUi.enabled", {
        permissions: plan.changes
          .map((change) => labels(change.permissionKey))
          .join(", "),
      }),
    );
  };
  const pendingImpact = pendingChange ? impactFor(pendingChange) : null;
  const pendingBlocked = pendingChange
    ? [
        pendingChange.permissionKey,
        ...(pendingImpact?.dependents.map((change) => change.permissionKey) ??
          []),
      ].filter((key) => !editable(key))
    : [];
  const confirmChange = () => {
    if (!pendingChange || !pendingImpact || pendingBlocked.length) return;
    onChange(applyChanges([pendingChange, ...pendingImpact.dependents]));
    setDependencyFeedback(
      t("dependenciesUi.disabled", {
        permissions: [
          pendingChange.permissionKey,
          ...pendingImpact.dependents.map((change) => change.permissionKey),
        ]
          .map((key) => labels(key))
          .join(", "),
      }),
    );
    setPendingChange(null);
  };
  const groups = permissionGroups.map((group) => ({
    ...group,
    visible: v1.access.permissionCatalog.filter(
      (permission) =>
        group.prefixes.some((prefix) => permission.key.startsWith(prefix)) &&
        (!isUser || !onlyCustom || grants.has(permission.key)) &&
        searchable(
          [
            labels(permission.key),
            descriptions(permission.key),
            t(`groups.${group.key}`),
            permission.key,
            ...(roles ?? [])
              .filter((role) =>
                role.permissions.some(
                  (grant) => grant.permissionKey === permission.key,
                ),
              )
              .map((role) => role.name),
          ].join(" "),
        ).includes(query),
    ),
  }));
  const selectedGroup =
    groups.find((group) => group.key === activeGroup && group.visible.length) ??
    groups.find((group) => group.visible.length) ??
    groups[0]!;
  const resultCount = groups.reduce(
    (count, group) => count + group.visible.length,
    0,
  );
  const roleNames = roles?.map((role) => role.name).join(", ");

  return (
    <section
      className="flex min-w-0 flex-col gap-4 font-body"
      aria-labelledby={`${id}-title`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={`${id}-title`} className="text-base font-semibold">
            {t("title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isUser
              ? roleNames
                ? t("inheritedFrom", { roles: roleNames })
                : t("noBaseRole")
              : t("roleHelp")}
          </p>
        </div>
        {isUser && value.length === 0 ? (
          <p className="self-start text-sm text-muted-foreground">
            {t("noCustom")}
          </p>
        ) : isUser ? (
          <Button
            type="button"
            variant="outline"
            className={`h-11 shrink-0 gap-2 self-start font-body md:h-11 ${onlyCustom ? "border-personal bg-personal-subtle text-personal hover:bg-personal-subtle hover:text-personal" : "border-border bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
            aria-pressed={onlyCustom}
            onClick={() => setOnlyCustom((current) => !current)}
          >
            <ListFilter aria-hidden="true" className="size-4" />
            {t("onlyCustom")}
            {value.length ? (
              <span className="text-xs tabular-nums">{value.length}</span>
            ) : null}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchField
          id={`${id}-search`}
          label={t("search")}
          className="h-11 min-w-0 flex-1 font-body md:h-11"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {dependencyFeedback ? (
        <p role="status" className="text-sm text-muted-foreground">
          {dependencyFeedback}
        </p>
      ) : null}
      <PermissionDependencyDialog
        change={
          pendingChange && pendingImpact
            ? {
                permissionKey: pendingChange.permissionKey,
                scopes: pendingImpact.after[pendingChange.permissionKey] ?? [],
              }
            : null
        }
        dependents={pendingImpact?.dependents ?? []}
        blocked={pendingBlocked}
        disabled={!!disabled}
        userOverrides={isUser}
        onConfirm={confirmChange}
        onCancel={() => setPendingChange(null)}
      />
      <p className="sr-only" role="status">
        {t("results", { count: resultCount })}
      </p>
      <Tabs
        value={selectedGroup.key}
        onValueChange={(key) => setActiveGroup(String(key))}
        className="min-w-0 gap-0"
      >
        <div
          className={
            stickyTabs
              ? "sticky top-0 z-raised bg-popover text-popover-foreground"
              : undefined
          }
        >
          <TabsList
            variant="line"
            aria-label={t("categories")}
            className="w-full shrink-0 gap-0 overflow-x-auto rounded-none border-b border-border p-0"
          >
            {groups.map((group) => (
              <TabsTrigger
                key={group.key}
                value={group.key}
                disabled={!group.visible.length}
                className="min-h-11 min-w-fit flex-none gap-2 rounded-none px-3 font-body text-sm data-active:text-link dark:data-active:text-link after:bg-primary group-data-horizontal/tabs:after:bottom-0 md:min-w-fit md:px-3"
              >
                <group.icon aria-hidden="true" className="size-4" />
                {t(`groups.${group.key}`)}
                {query || onlyCustom ? (
                  <span className="text-xs tabular-nums">
                    {group.visible.length}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {groups.map((group) => (
          <TabsContent
            key={group.key}
            value={group.key}
            className="min-w-0 pt-4"
          >
            <div className="flex flex-col gap-3">
              {group.visible.map((permission) => {
                const grant = grants.get(permission.key);
                const inherited = inheritedScopes(roles ?? [], permission.key);
                const selected = normalizeScopes(grant?.scopes ?? inherited);
                const mode: PermissionMode = grant
                  ? grant.scopes.length
                    ? "allow"
                    : "deny"
                  : isUser
                    ? "default"
                    : "deny";
                const action =
                  permissionActions[permissionActionKeys[permission.key]];
                const ActionIcon = action.icon;
                const choices = scopeOptions(permission.scopes);
                const modes: PermissionMode[] = isUser
                  ? ["allow", "default", "deny"]
                  : ["allow", "deny"];
                const sources = (roles ?? [])
                  .filter((role) =>
                    role.permissions.some(
                      (row) =>
                        row.permissionKey === permission.key &&
                        row.scopes.length,
                    ),
                  )
                  .map((role) => role.name)
                  .join(", ");
                const rowDisabled =
                  disabled || canEditPermission?.(permission.key) === false;
                const requiredPlan = planRequiredPermissions(
                  permission.key,
                  currentScopes,
                );
                const blockedRequirements = [
                  ...new Set([
                    ...requiredPlan.unresolved,
                    ...requiredPlan.changes
                      .filter((change) => !canApplyGrant(change))
                      .map((change) => change.permissionKey),
                  ]),
                ];
                const deniedRequirements = requiredPlan.changes
                  .filter(
                    (change) =>
                      grants.has(change.permissionKey) &&
                      !grants.get(change.permissionKey)?.scopes.length,
                  )
                  .map((change) => change.permissionKey);
                const rowId = `${id}-${permission.key}`;
                const label = labels(permission.key);
                const hasDetails =
                  (isUser && !!grant) || permission.prerequisites.length > 0;
                const detailsOpen =
                  hasDetails && expandedDetails.includes(permission.key);
                const changeMode = (next: PermissionMode) => {
                  if (next === "default") replace(permission.key, null);
                  else if (next === "deny")
                    replace(permission.key, [], grant?.reason);
                  else {
                    const base = normalizeScopes(
                      inherited.filter((scope) =>
                        permission.scopes.some((allowed) => allowed === scope),
                      ),
                    );
                    replace(
                      permission.key,
                      base.length ? base : choices[0]!,
                      grant?.reason,
                    );
                  }
                };
                return (
                  <div
                    key={permission.key}
                    role="group"
                    aria-labelledby={`${rowId}-label`}
                    className={`grid min-w-0 grid-cols-12 items-center gap-x-2 gap-y-3 rounded-lg border bg-card px-4 pt-4 text-card-foreground lg:gap-x-4 lg:px-5 lg:pt-5 ${isUser && grant ? "border-primary" : "border-border"} ${hasDetails ? "pb-0" : "pb-4 lg:pb-5"}`}
                  >
                    <div className="col-span-12 min-w-0 self-start lg:col-span-5">
                      <div className="flex items-start justify-between gap-1 lg:gap-2">
                        <div className="flex min-w-0 items-start gap-2">
                          <h4
                            id={`${rowId}-label`}
                            className="font-body text-sm font-semibold"
                          >
                            {label}
                          </h4>
                          {isUser && grant ? (
                            <Badge
                              variant="secondary"
                              className="bg-personal-subtle text-personal"
                            >
                              {t("customOverride")}
                            </Badge>
                          ) : null}
                        </div>
                        <span
                          aria-hidden="true"
                          className={`flex size-9 shrink-0 items-center justify-center rounded-md ${action.tone}`}
                        >
                          <ActionIcon className="size-4" />
                        </span>
                      </div>
                    </div>
                    <div className="col-span-12 min-w-0 lg:col-span-3">
                      <Label
                        id={`${rowId}-scope-label`}
                        htmlFor={
                          mode === "default" ? undefined : `${rowId}-scope`
                        }
                        className="mb-1"
                      >
                        {t("scope")}
                      </Label>
                      <ScopePicker
                        id={`${rowId}-scope`}
                        label={t("scopeFor", { permission: label })}
                        scopes={selected}
                        choices={choices}
                        disabled={rowDisabled}
                        readOnly={mode === "default"}
                        denied={mode === "deny"}
                        onChange={(next) =>
                          replace(permission.key, next, grant?.reason)
                        }
                      />
                    </div>
                    <div className="col-span-12 flex min-w-0 flex-col gap-2 self-end lg:col-span-4">
                      <SegmentedRadioGroup
                        label={t("modeFor", { permission: label })}
                        name={`${rowId}-mode`}
                        value={mode}
                        onValueChange={changeMode}
                        disabled={rowDisabled}
                        containerClassName="min-w-0"
                        columns={isUser ? 3 : 2}
                        options={modes.map((option) => ({
                          value: option,
                          label: t(`modes.${option}`),
                          tone:
                            option === "allow"
                              ? "primary"
                              : option === "deny"
                                ? "destructive"
                                : "neutral",
                        }))}
                      />
                      {isUser ? (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {sources
                            ? t("inheritedFrom", { roles: sources })
                            : t("notInRole")}
                          {grant ? ` ${t("overrideHelp")}` : ""}
                        </p>
                      ) : null}
                    </div>
                    {requiredPlan.changes.length ||
                    requiredPlan.unresolved.length ? (
                      <div className="col-span-12">
                        <PermissionDependencyNotice
                          changes={requiredPlan.changes}
                          blocked={blockedRequirements}
                          denied={deniedRequirements}
                          disabled={rowDisabled}
                          onEnable={() => enableRequirements(permission.key)}
                        />
                      </div>
                    ) : null}
                    <div
                      hidden={!hasDetails}
                      className="col-span-12 flex min-w-0 flex-col"
                    >
                      <button
                        type="button"
                        aria-expanded={detailsOpen}
                        aria-controls={`${rowId}-details`}
                        onClick={() =>
                          setExpandedDetails((current) =>
                            detailsOpen
                              ? current.filter((key) => key !== permission.key)
                              : [...current, permission.key],
                          )
                        }
                        className={`flex h-10 min-h-10 w-full shrink-0 items-center justify-center gap-2 rounded-md text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${hasDetails ? "" : "hidden"}`}
                      >
                        <span className="sr-only">{t("details")}</span>
                        <ChevronDown
                          aria-hidden="true"
                          className={`size-4 transition-transform duration-normal ease-standard motion-reduce:transition-none ${detailsOpen ? "rotate-180" : "rotate-0"}`}
                        />
                      </button>
                      <div
                        id={`${rowId}-details`}
                        inert={!detailsOpen}
                        aria-hidden={!detailsOpen}
                        className={`col-span-12 grid min-w-0 transition-[grid-template-rows,opacity] duration-normal ease-standard motion-reduce:transition-none ${detailsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"} ${hasDetails ? "" : "lg:hidden"}`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="flex flex-col gap-3 pb-4 text-xs text-muted-foreground lg:pb-5">
                            {permission.prerequisites.length ? (
                              <div className="flex flex-col gap-1">
                                <p className="font-semibold text-foreground">
                                  {t("dependencies")}
                                </p>
                                <ul className="flex list-disc flex-col gap-1 pl-4">
                                  {permission.prerequisites.map((key) => {
                                    const requirements =
                                      permission.scopePrerequisites.filter(
                                        (item) => item.key === key,
                                      );
                                    return (
                                      <li key={key}>
                                        {labels(key)}
                                        {requirements.length
                                          ? ` (${requirements.map((item) => item.anyOf.map((scope) => t(`scopes.${scope}`)).join(" / ")).join("; ")})`
                                          : ""}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ) : null}
                            {isUser && grant ? (
                              <div className="flex max-w-(--breakpoint-sm) flex-col gap-2">
                                <Label htmlFor={`${rowId}-reason`}>
                                  {t("reason")}
                                </Label>
                                <Input
                                  id={`${rowId}-reason`}
                                  aria-label={t("reasonFor", {
                                    permission: label,
                                  })}
                                  className="h-11 font-body md:h-11"
                                  maxLength={500}
                                  value={grant.reason ?? ""}
                                  disabled={rowDisabled}
                                  placeholder={t("reasonPlaceholder")}
                                  onChange={(event) =>
                                    replace(
                                      permission.key,
                                      grant.scopes,
                                      event.target.value,
                                    )
                                  }
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
      {!resultCount ? (
        <div className="flex flex-col items-start gap-3 py-6">
          <p className="font-semibold">
            {t(onlyCustom && !query ? "noCustom" : "noResults")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t(onlyCustom && !query ? "noCustomHelp" : "noResultsHelp")}
          </p>
          <Button
            type="button"
            variant="outline"
            className="font-body"
            onClick={() => {
              setSearch("");
              setOnlyCustom(false);
            }}
          >
            {t("clearFilters")}
          </Button>
        </div>
      ) : null}
      <div className="flex items-start gap-3 border-t border-border pt-4 text-sm text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="flex flex-col gap-1">
          {isUser ? (
            <p className="font-semibold">
              {roleNames
                ? t("inheritedFrom", { roles: roleNames })
                : t("noBaseRole")}
            </p>
          ) : null}
          <p className="text-xs leading-relaxed">
            {t(isUser ? "inheritanceHelp" : "roleHelp")}
          </p>
        </div>
      </div>
    </section>
  );
}

export function PermissionDiff({
  before,
  after,
}: {
  before: v1.access.EffectiveScopes;
  after: v1.access.EffectiveScopes;
}) {
  const t = useTranslations("workspace");
  const labels = useTranslations("access.permissions");
  const changed = v1.access.permissionCatalog.filter(
    ({ key }) =>
      JSON.stringify(before[key] ?? []) !== JSON.stringify(after[key] ?? []),
  );
  const display = (scopes: v1.access.PermissionScope[] = []) =>
    scopes.length
      ? scopes.map((scope) => t(`access.scopes.${scope}`)).join(", ")
      : t("none");
  return (
    <ul className="flex flex-col gap-2">
      {changed.map(({ key }) => (
        <li key={key} className="text-sm">
          <span className="font-medium">{labels(key)}</span>:{" "}
          {display(before[key])} → {display(after[key])}
        </li>
      ))}
    </ul>
  );
}
