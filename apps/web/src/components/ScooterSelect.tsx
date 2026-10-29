"use client";

import { useCallback, useMemo } from "react";
import { TriangleIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { v1 } from "@repo/api-shared";
import { spacing } from "@repo/theme";
import { Button, SheetSelect } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { webApi } from "@/lib/api";
import { Feedback, useRemote } from "@/components/WorkspaceForm";
import type { SheetSelectProps } from "@repo/ui/components/sheet-select";
import { buttonVariants } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { ScooterCover } from "./ScooterCover";

export type ScooterSelectItem = Pick<
  v1.scooters.Scooter,
  "id" | "fleetNumber" | "brandCode" | "brand" | "model" | "registrationNumber"
> &
  Partial<
    Pick<
      v1.scooters.Scooter,
      | "coverUrl"
      | "vin"
      | "problemDifficultyCounts"
      | "registrationType"
      | "temporaryRegistrationExpiresAt"
      | "maintenanceHoldCount"
      | "rentalInsuranceStatus"
      | "missingClientDocuments"
      | "itpStatus"
    >
  >;

const EMPTY_SCOOTERS: ScooterSelectItem[] = [];

const difficultyStyles = {
  easy: "text-info",
  medium: "text-warning",
  hard: "text-warning-hover",
  unknown: "text-muted-foreground",
} as const;

/** The same content is used for sheet options and selected scooters. */
export function ScooterSelectRow({ scooter }: { scooter: ScooterSelectItem }) {
  const t = useTranslations("workspace");
  return (
    <span className="flex min-w-0 flex-1 items-center gap-4">
      <ScooterCover scooter={scooter} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-base font-semibold">
          {v1.scooters.scooterDisplayCode(scooter)}
        </span>
        <span className="truncate text-sm">
          {scooter.registrationNumber || t("problems.noPlate")}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {scooter.brand} {scooter.model}
        </span>
        <span className="flex flex-wrap gap-1">
          {Object.entries(difficultyStyles).map(([difficulty, color]) => {
            const count =
              scooter.problemDifficultyCounts?.[
                difficulty as keyof typeof difficultyStyles
              ] ?? 0;
            if (!count) return null;
            const label = t("problems.difficultyCount", {
              difficulty: t(
                `problems.${difficulty === "unknown" ? "unassessed" : difficulty}`,
              ),
              count,
            });
            return (
              <span
                key={difficulty}
                role="img"
                aria-label={label}
                title={label}
                className="relative flex size-8 shrink-0 items-center justify-center"
              >
                <TriangleIcon
                  aria-hidden="true"
                  strokeWidth={spacing.px}
                  className={`absolute inset-0 size-full fill-none ${color}`}
                />
                <span
                  aria-hidden="true"
                  className={`relative pt-1 text-xs font-semibold ${color}`}
                >
                  {count}
                </span>
              </span>
            );
          })}
          {scooter.problemDifficultyCounts &&
          Object.values(scooter.problemDifficultyCounts).every(
            (count) => count === 0,
          ) ? (
            <span className="text-xs text-muted-foreground">
              {t("problems.noActiveProblems")}
            </span>
          ) : null}
        </span>
      </span>
    </span>
  );
}

/** Controlled scooter selector. Pass `multiple` with an array of scooter IDs. */
export type ScooterSelectProps = Omit<
  SheetSelectProps,
  | "options"
  | "value"
  | "onValueChange"
  | "multiple"
  | "label"
  | "renderOption"
  | "renderHeaderAction"
  | "triggerContent"
  | "addAction"
> & {
  label?: string;
  /** Rental-specific eligibility is supplied by the feature, not this picker. */
  getUnavailableReasons?: (scooter: ScooterSelectItem) => readonly string[];
  /** Already-authorized summaries, e.g. scooters visible in problem filters. */
  scooters?: readonly ScooterSelectItem[];
} & (
    | {
        multiple?: false;
        value: string | null | undefined;
        onValueChange: (id: string) => void;
      }
    | {
        multiple: true;
        value: readonly string[];
        onValueChange: (ids: string[]) => void;
      }
  );

export async function loadScooterSelectItems() {
  const items: v1.scooters.Scooter[] = [];
  for (let page = 1; ; page++) {
    const list = await webApi.fetch(
      `/v1/scooters?pageSize=100&page=${page}`,
      v1.scooters.scooterListSchema,
      { cache: "no-store" },
    );
    items.push(...list.items);
    if (page * list.pageSize >= list.total || !list.items.length) break;
  }
  return items
    .filter((scooter) => !scooter.deletedAt)
    .sort((a, b) => a.fleetNumber - b.fleetNumber);
}

export function ScooterSelect(props: ScooterSelectProps) {
  const {
    label,
    scooters: suppliedScooters,
    getUnavailableReasons,
    ...controlProps
  } = props;
  const t = useTranslations("workspace");
  const load = useCallback(async () => {
    if (suppliedScooters !== undefined) return suppliedScooters;
    return loadScooterSelectItems();
  }, [suppliedScooters]);
  const remote = useRemote(load);
  const scooters = suppliedScooters ?? remote.data ?? EMPTY_SCOOTERS;
  const byId = useMemo(
    () => new Map(scooters.map((scooter) => [scooter.id, scooter])),
    [scooters],
  );
  const selectedIds = props.multiple
    ? props.value
    : props.value
      ? [props.value]
      : [];
  const selectedScooter =
    !props.multiple && props.value ? byId.get(props.value) : undefined;
  return (
    <div className="flex flex-col gap-2">
      {props.multiple
        ? selectedIds.map((id) => {
            const scooter = byId.get(id);
            return (
              <div
                key={id}
                data-slot="selected-scooter"
                className="flex min-h-24 items-center gap-3 rounded-lg border border-border bg-selectable-row px-3 py-2"
              >
                {scooter ? (
                  <ScooterSelectRow scooter={scooter} />
                ) : (
                  <span className="flex-1 text-muted-foreground">
                    {t("loading")}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={props.disabled}
                  aria-label={t("scooterSelect.remove", {
                    code: scooter
                      ? v1.scooters.scooterDisplayCode(scooter)
                      : t("problems.scooter"),
                  })}
                  onClick={() =>
                    props.onValueChange(
                      props.value.filter((selected) => selected !== id),
                    )
                  }
                >
                  <XIcon aria-hidden="true" className="size-4" />
                </Button>
              </div>
            );
          })
        : null}
      <SheetSelect
        label={label ?? t("problems.scooter")}
        placeholder={t("scooterSelect.select")}
        searchPlaceholder={t("problems.searchScooters")}
        clearSearchLabel={t("problems.clearScooterSearch")}
        closeLabel={t("cancel")}
        emptyMessage={
          remote.loading
            ? t("loading")
            : remote.error
              ? remote.error
              : t("problems.noScooters")
        }
        renderHeaderAction={
          remote.error
            ? () => (
                <Button type="button" variant="outline" onClick={remote.reload}>
                  {t("retry")}
                </Button>
              )
            : undefined
        }
        {...controlProps}
        triggerVariant="card"
        addAction={
          !selectedScooter
            ? {
                text: props.multiple
                  ? t("scooterSelect.addMore")
                  : (props.placeholder ?? t("scooterSelect.select")),
                icon: <PlusIcon />,
              }
            : undefined
        }
        className={cn(
          selectedScooter && "h-auto min-h-24 bg-selectable-row md:h-auto",
          props.className,
        )}
        triggerContent={
          selectedScooter ? (
            <>
              <ScooterSelectRow scooter={selectedScooter} />
              <span
                className={buttonVariants({
                  variant: "outline",
                  size: "icon-sm",
                })}
              >
                <PencilIcon aria-hidden="true" className="size-4" />
                <span className="sr-only">{t("scooterSelect.edit")}</span>
              </span>
            </>
          ) : (
            <>
              <PlusIcon aria-hidden="true" className="size-4" />
              {props.multiple
                ? t("scooterSelect.addMore")
                : (props.placeholder ?? t("scooterSelect.select"))}
            </>
          )
        }
        options={scooters.map((scooter) => ({
          disabled: Boolean(getUnavailableReasons?.(scooter).length),
          searchOnly: Boolean(getUnavailableReasons?.(scooter).length),
          value: scooter.id,
          label: `${v1.scooters.scooterDisplayCode(scooter)} · ${scooter.registrationNumber || t("problems.noPlate")} · ${scooter.brand} ${scooter.model ?? ""}${getUnavailableReasons?.(scooter).length ? ` · ${getUnavailableReasons(scooter).join(" · ")}` : ""}`,
          keywords: [scooter.vin ?? "", scooter.id],
        }))}
        renderOption={(option) => {
          const scooter = byId.get(option.value)!;
          const reasons = getUnavailableReasons?.(scooter) ?? [];
          return (
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <ScooterSelectRow scooter={scooter} />
              {reasons.map((reason) => (
                <span key={reason} className="text-sm text-warning">
                  {reason}
                </span>
              ))}
            </span>
          );
        }}
      />
      <Feedback error={remote.error} />
    </div>
  );
}
