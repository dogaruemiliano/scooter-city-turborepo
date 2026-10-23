"use client";

import {
  ChevronDown,
  Inbox,
  LockKeyhole,
  UserRound,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { SheetSelect } from "@repo/ui/components/sheet-select";

const presentations = {
  OWN: { icon: UserRound, tone: "bg-personal-subtle text-personal" },
  ASSIGNED: { icon: UserRoundCheck, tone: "bg-info-subtle text-info" },
  AVAILABLE: { icon: Inbox, tone: "bg-warning-subtle text-warning-text" },
  ALL: { icon: Users, tone: "bg-accent text-accent-foreground" },
  COMBINED: { icon: UserRoundCheck, tone: "bg-info-subtle text-info" },
  NONE: { icon: LockKeyhole, tone: "bg-muted text-muted-foreground" },
} as const;

export function ScopePicker({
  id,
  label,
  scopes,
  choices,
  disabled,
  readOnly,
  denied,
  onChange,
}: {
  id: string;
  label: string;
  scopes: v1.access.PermissionScope[];
  choices: v1.access.PermissionScope[][];
  disabled: boolean;
  readOnly: boolean;
  denied: boolean;
  onChange: (scopes: v1.access.PermissionScope[]) => void;
}) {
  const t = useTranslations("access.editor");
  const display = (value: readonly v1.access.PermissionScope[]) =>
    !value.length
      ? t("noAccess")
      : value.includes("ASSIGNED") && value.includes("AVAILABLE")
        ? t("assignedAndAvailable")
        : value.map((scope) => t(`scopes.${scope}`)).join(" + ");
  const presentation = (value: readonly v1.access.PermissionScope[]) =>
    presentations[
      !value.length
        ? "NONE"
        : value.includes("ALL")
          ? "ALL"
          : value.length > 1
            ? "COMBINED"
            : value[0]!
    ];
  const description = (value: readonly v1.access.PermissionScope[]) =>
    t(
      `scopeDescriptions.${
        !value.length
          ? "NONE"
          : value.includes("ALL")
            ? "ALL"
            : value.length > 1
              ? "COMBINED"
              : value[0]!
      }`,
    );
  const selected = denied ? [] : scopes;
  const SelectedIcon = presentation(selected).icon;
  const icon = (
    <span
      aria-hidden="true"
      className={`flex size-8 shrink-0 items-center justify-center rounded-md ${denied ? "bg-destructive-subtle text-destructive" : presentation(selected).tone}`}
    >
      <SelectedIcon className="size-4" />
    </span>
  );
  const preview = (
    <>
      {icon}
      <span className="min-w-0 flex-1 text-sm">{display(selected)}</span>
    </>
  );

  if (readOnly)
    return (
      <div
        id={id}
        aria-label={label}
        className="flex min-h-12 items-center gap-2 rounded-lg bg-muted px-3 py-2 md:min-h-11"
      >
        {preview}
      </div>
    );

  return (
    <SheetSelect
      id={id}
      label={label}
      value={denied ? null : scopes.join(",")}
      disabled={disabled || denied}
      onValueChange={(value) => {
        const choice = choices.find((item) => item.join(",") === value);
        if (choice) onChange(choice);
      }}
      options={choices.map((value) => ({
        value: value.join(","),
        label: display(value),
        keywords: [description(value)],
      }))}
      closeLabel={t("scopeClose")}
      searchPlaceholder={t("scopeSearch")}
      clearSearchLabel={t("scopeClearSearch")}
      emptyMessage={t("scopeNoResults")}
      className="h-auto min-h-12 md:h-auto md:min-h-11"
      optionClassName="h-auto min-h-12 items-start gap-3 rounded-lg border border-border p-4"
      triggerContent={
        <>
          {preview}
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </>
      }
      renderOption={(option) => {
        const value = choices.find((item) => item.join(",") === option.value)!;
        const { icon: Icon, tone } = presentation(value);
        return (
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className={`flex size-9 shrink-0 items-center justify-center rounded-md ${tone}`}
            >
              <Icon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold">{option.label}</span>
              <span className="text-sm font-normal leading-relaxed text-muted-foreground">
                {description(value)}
              </span>
            </div>
          </div>
        );
      }}
    />
  );
}
