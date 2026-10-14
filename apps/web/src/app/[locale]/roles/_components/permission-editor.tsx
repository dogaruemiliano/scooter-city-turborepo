"use client";

import { useId, useState } from "react";
import {
  Banknote,
  CalendarDays,
  ChevronRight,
  Info,
  Monitor,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import { v1 } from "@repo/api-shared";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { NativeSelect } from "@repo/ui/components/native-select";
import { SearchField } from "@repo/ui/components/search-field";
import { SegmentedRadioGroup } from "@repo/ui/components/segmented-radio-group";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { useTranslations } from "next-intl";

const permissionGroups = [
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
}: {
  value: Grant[];
  onChange: (value: Grant[]) => void;
  roles?: v1.access.Role[];
  disabled?: boolean;
}) {
  const t = useTranslations("access.editor");
  const labels = useTranslations("access.permissions");
  const descriptions = useTranslations("access.descriptions");
  const id = useId();
  const [search, setSearch] = useState("");
  const [onlyCustom, setOnlyCustom] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string>(() =>
    roles?.some((role) => role.slug === "mechanic") ? "service" : "fleet",
  );
  const [expandedDetails, setExpandedDetails] = useState<string[]>([]);
  const query = searchable(search.trim());
  const isUser = roles !== undefined;
  const grants = new Map(value.map((grant) => [grant.permissionKey, grant]));
  const displayScopes = (scopes: readonly v1.access.PermissionScope[]) =>
    !scopes.length
      ? t("noAccess")
      : scopes.includes("ASSIGNED") && scopes.includes("AVAILABLE")
        ? t("assignedAndAvailable")
        : scopes.map((scope) => t(`scopes.${scope}`)).join(" + ");
  const replace = (
    key: v1.access.PermissionKey,
    scopes: v1.access.PermissionScope[] | null,
    reason?: string | null,
  ) => {
    if (disabled) return;
    const rest = value.filter((grant) => grant.permissionKey !== key);
    onChange(
      scopes === null || (!isUser && !scopes.length)
        ? rest
        : [
            ...rest,
            {
              permissionKey: key,
              scopes: normalizeScopes(scopes),
              ...(reason ? { reason } : {}),
            },
          ],
    );
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
      <h3 id={`${id}-title`} className="sr-only">
        {t("title")}
      </h3>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchField
          id={`${id}-search`}
          label={t("search")}
          className="h-11 min-w-0 flex-1 font-body md:h-11"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {isUser ? (
          <Button
            type="button"
            variant={onlyCustom ? "secondary" : "ghost"}
            className="h-11 gap-2 self-start font-body md:h-11"
            aria-pressed={onlyCustom}
            onClick={() => setOnlyCustom((current) => !current)}
          >
            {t("onlyCustom")}
            {value.length ? (
              <span className="text-xs tabular-nums">{value.length}</span>
            ) : null}
          </Button>
        ) : null}
      </div>
      <p className="sr-only" role="status">
        {t("results", { count: resultCount })}
      </p>
      <Tabs
        value={selectedGroup.key}
        onValueChange={(key) => setActiveGroup(String(key))}
        className="min-w-0 gap-0"
      >
        <TabsList
          variant="line"
          aria-label={t("categories")}
          className="w-full shrink-0 gap-0 overflow-x-auto rounded-none border-y border-border p-0"
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
        {groups.map((group) => (
          <TabsContent
            key={group.key}
            value={group.key}
            className="min-w-0 divide-y divide-border"
          >
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
              const choices = scopeOptions(permission.scopes);
              const modes: PermissionMode[] = isUser
                ? ["allow", "default", "deny"]
                : ["allow", "deny"];
              const sources = (roles ?? [])
                .filter((role) =>
                  role.permissions.some(
                    (row) =>
                      row.permissionKey === permission.key && row.scopes.length,
                  ),
                )
                .map((role) => role.name)
                .join(", ");
              const rowId = `${id}-${permission.key}`;
              const label = labels(permission.key);
              const hasDetails = isUser || permission.prerequisites.length > 0;
              const detailsOpen = expandedDetails.includes(permission.key);
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
                  className="grid min-w-0 grid-cols-12 items-center gap-x-2 gap-y-2 py-3 lg:gap-x-4 lg:gap-y-3 lg:py-4"
                >
                  <div className="col-span-12 min-w-0 lg:col-span-5">
                    <div className="flex items-center justify-between gap-1 lg:gap-2">
                      <h4
                        id={`${rowId}-label`}
                        className="font-body text-sm font-semibold"
                      >
                        {label}
                      </h4>
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
                        className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:min-w-0 ${hasDetails ? "" : "hidden"}`}
                      >
                        <span className="sr-only lg:not-sr-only">
                          {t("details")}
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          className={`size-3 transition-transform duration-fast ease-standard ${detailsOpen ? "rotate-90" : ""}`}
                        />
                      </button>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {descriptions(permission.key)}
                    </p>
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
                    {mode === "default" ? (
                      <p
                        aria-labelledby={`${rowId}-label ${rowId}-scope-label`}
                        className="flex min-h-12 items-center text-sm md:min-h-11"
                      >
                        {displayScopes(selected)}
                      </p>
                    ) : (
                      <NativeSelect
                        id={`${rowId}-scope`}
                        aria-label={t("scopeFor", { permission: label })}
                        value={mode === "deny" ? "" : selected.join(",")}
                        disabled={disabled || mode !== "allow"}
                        onChange={(event) => {
                          const next = choices.find(
                            (scopes) => scopes.join(",") === event.target.value,
                          );
                          if (next)
                            replace(permission.key, next, grant?.reason);
                        }}
                        className="font-body"
                      >
                        {mode === "deny" ? (
                          <option value="">{t("noAccess")}</option>
                        ) : (
                          choices.map((scopes) => (
                            <option
                              key={scopes.join(",")}
                              value={scopes.join(",")}
                            >
                              {displayScopes(scopes)}
                            </option>
                          ))
                        )}
                      </NativeSelect>
                    )}
                  </div>
                  <SegmentedRadioGroup
                    label={t("modeFor", { permission: label })}
                    name={`${rowId}-mode`}
                    value={mode}
                    onValueChange={changeMode}
                    disabled={disabled}
                    containerClassName="col-span-12 min-w-0 self-end lg:col-span-4"
                    className={isUser ? "grid-cols-3" : "grid-cols-2"}
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
                  <div
                    id={`${rowId}-details`}
                    hidden={!detailsOpen}
                    className={`col-span-12 min-w-0 ${hasDetails ? "" : "lg:hidden"}`}
                  >
                    <div className="flex flex-col gap-3 pb-2 pl-4 text-xs text-muted-foreground">
                      {isUser ? (
                        <p>
                          {sources
                            ? t("inheritedFrom", { roles: sources })
                            : t("notInRole")}
                          {grant ? ` ${t("overrideHelp")}` : ""}
                        </p>
                      ) : null}
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
                          <label
                            htmlFor={`${rowId}-reason`}
                            className="text-xs font-semibold text-foreground"
                          >
                            {t("reason")}
                          </label>
                          <Input
                            id={`${rowId}-reason`}
                            aria-label={t("reasonFor", { permission: label })}
                            className="h-11 font-body md:h-11"
                            maxLength={500}
                            value={grant.reason ?? ""}
                            disabled={disabled}
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
              );
            })}
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
