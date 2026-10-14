"use client";
import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { v1 } from "@repo/api-shared";
import {
  Field,
  FieldLabel,
  ListEmpty,
  ListFilterSheet,
  ListLayout,
  ListPagination,
  ListStatus,
  SheetSelect,
  SegmentedRadioGroup,
} from "@repo/ui/components";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import { useRemote } from "@/components/WorkspaceForm";
import { memberName } from "./ProblemForms";
import { ProblemDetailSheet } from "./ProblemDetailSheet";
import { PageTitleOverride } from "@/components/PageTitleOverride";
import { ProblemListItem } from "./ProblemListItem";
import { ProblemList } from "./ProblemList";

type ProblemFilters = {
  view: "assigned" | "available" | "";
  status: v1.problems.Problem["status"] | "";
  severity: v1.problems.Problem["severity"] | "";
  scooterId: string;
  assigneeId: string;
  blocking: "" | "true" | "false";
};

export function ProblemsWorkspace() {
  const t = useTranslations("workspace");
  const shared = useTranslations("shared");
  const { user } = useSession();
  const locale = resolveRouteLocale(useLocale());
  const defaultView = "";
  const [chosen, setChosen] = useState<ProblemFilters | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<v1.problems.Problem | null>(null);
  const filters: ProblemFilters = chosen ?? {
    view: defaultView,
    status: "",
    severity: "",
    scooterId: "",
    assigneeId: "",
    blocking: "",
  };
  const { view, status, severity, scooterId, assigneeId, blocking } = filters;
  const load = useCallback(() => {
    const query = new URLSearchParams({
      ...(view ? { view } : {}),
      page: String(page),
    });
    if (status) query.set("status", status);
    if (severity) query.set("severity", severity);
    if (scooterId) query.set("scooterId", scooterId);
    if (assigneeId === "unassigned") query.set("unassigned", "true");
    else if (assigneeId) query.set("assigneeId", assigneeId);
    if (blocking) query.set("blocking", blocking);
    return webApi.fetch(
      `/v1/problems?${query}`,
      v1.problems.problemListSchema,
      { cache: "no-store" },
    );
  }, [view, status, severity, scooterId, assigneeId, blocking, page]);
  const remote = useRemote(load);
  const quickFilter = assigneeId
    ? "custom"
    : view === "assigned"
      ? status
        ? "custom"
        : "mine"
      : status === "open"
        ? "open"
        : status === "resolved"
          ? "resolved"
          : status
            ? "custom"
            : "";
  const mayReadMine = canAccess(user, "problems.read", "ASSIGNED");

  return (
    <main className="flex min-w-0 flex-col gap-6 p-4 md:p-8">
      <PageTitleOverride title={t("problems.title")} />
      <ListLayout
        summary={
          remote.data && (remote.loading || remote.error)
            ? shared("list.staleResults")
            : undefined
        }
        filters={
          <ListFilterSheet<ProblemFilters>
            value={filters}
            defaultValue={{
              view: defaultView,
              status: "",
              severity: "",
              scooterId: "",
              assigneeId: "",
              blocking: "",
            }}
            onApply={(value) => {
              setChosen(value);
              setPage(1);
              setSelected(null);
            }}
            appliedCount={
              Number(view !== defaultView) +
              [status, severity, scooterId, assigneeId, blocking].filter(
                Boolean,
              ).length
            }
            title={shared("list.filters")}
            applyLabel={shared("list.apply")}
            resetLabel={shared("list.reset")}
            cancelLabel={shared("actions.cancel")}
            applyErrorLabel={shared("list.applyError")}
          >
            {({ value, setValue }) => (
              <>
                <Field>
                  <FieldLabel>{t("problems.view")}</FieldLabel>
                  <SegmentedRadioGroup<ProblemFilters["view"]>
                    id="service-view-filter"
                    name="service-view-filter"
                    label={t("problems.view")}
                    value={value.view}
                    columns={
                      canAccess(user, "problems.read", "ASSIGNED") &&
                      canAccess(user, "problems.read", "AVAILABLE")
                        ? 2
                        : 1
                    }
                    deselectValue=""
                    showCheckmark
                    onValueChange={(view) => setValue({ ...value, view })}
                    options={[
                      ...(canAccess(user, "problems.read", "ASSIGNED")
                        ? [
                            {
                              value: "assigned" as const,
                              label: t("problems.mine"),
                            },
                          ]
                        : []),
                      ...(canAccess(user, "problems.read", "AVAILABLE")
                        ? [
                            {
                              value: "available" as const,
                              label: t("problems.available"),
                            },
                          ]
                        : []),
                    ]}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("status")}</FieldLabel>
                  <SegmentedRadioGroup<ProblemFilters["status"]>
                    id="service-status-filter"
                    name="service-status-filter"
                    label={t("status")}
                    value={value.status}
                    deselectValue=""
                    columns={2}
                    showCheckmark
                    onValueChange={(status) => setValue({ ...value, status })}
                    options={v1.problems.problemStatusSchema.options.map(
                      (status) => ({
                        value: status,
                        label: t(`problems.${status}`),
                      }),
                    )}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("problems.severity")}</FieldLabel>
                  <SegmentedRadioGroup
                    id="service-severity-filter"
                    name="service-severity-filter"
                    label={t("problems.severity")}
                    value={value.severity ?? ""}
                    deselectValue=""
                    columns={2}
                    showCheckmark
                    onValueChange={(severity) =>
                      setValue({ ...value, severity })
                    }
                    options={v1.problems.problemSeveritySchema.options.map(
                      (severity) => ({
                        value: severity,
                        label: t(`problems.${severity}`),
                        severity,
                      }),
                    )}
                  />
                </Field>
                <ProblemFilterOptions value={value} onChange={setValue} />
                <Field>
                  <FieldLabel>{t("problems.scooterCondition")}</FieldLabel>
                  <SegmentedRadioGroup<ProblemFilters["blocking"]>
                    id="service-blocking-filter"
                    name="service-blocking-filter"
                    label={t("problems.scooterCondition")}
                    value={value.blocking}
                    deselectValue=""
                    showCheckmark
                    onValueChange={(blocking) =>
                      setValue({ ...value, blocking })
                    }
                    options={[
                      {
                        value: "false",
                        label: t("problems.functional"),
                        tone: "success",
                        colorUnselected: true,
                      },
                      {
                        value: "true",
                        label: t("problems.defective"),
                        tone: "destructive",
                        colorUnselected: true,
                      },
                    ]}
                  />
                </Field>
              </>
            )}
          </ListFilterSheet>
        }
        action={
          canAccess(user, "problems.create") ? (
            <Link
              href={localizePath("/problems/new", locale)}
              className={buttonVariants()}
            >
              <Plus aria-hidden="true" data-icon="inline-start" />
              {t("problems.add")}
            </Link>
          ) : undefined
        }
        footer={
          remote.data ? (
            <ListPagination
              canPrevious={!remote.loading && page > 1}
              canNext={
                !remote.loading &&
                page * remote.data.pageSize < remote.data.total
              }
              onPrevious={() => {
                setPage((value) => value - 1);
                setSelected(null);
              }}
              onNext={() => {
                setPage((value) => value + 1);
                setSelected(null);
              }}
              label={shared("list.pagination")}
              previousLabel={t("previous")}
              nextLabel={t("next")}
            />
          ) : undefined
        }
      >
        <SegmentedRadioGroup
          appearance="pills"
          name="problem-quick-filter"
          label={t("problems.quickFilters.label")}
          value={quickFilter}
          deselectValue=""
          options={[
            {
              value: "open",
              label: t("problems.quickFilters.open"),
              tone: "primary",
            },
            ...(mayReadMine
              ? [
                  {
                    value: "mine",
                    label: t("problems.quickFilters.mine"),
                    tone: "primary" as const,
                  },
                ]
              : []),
            {
              value: "resolved",
              label: t("problems.quickFilters.resolved"),
              tone: "primary",
            },
          ]}
          onValueChange={(next) => {
            if (next === "custom") return;
            setChosen({
              ...filters,
              view: next === "mine" ? "assigned" : "",
              status:
                next === "open"
                  ? "open"
                  : next === "resolved"
                    ? "resolved"
                    : "",
              assigneeId: "",
            });
            setPage(1);
            setSelected(null);
          }}
        />
        <ListStatus
          initial={!remote.data}
          loading={remote.loading}
          error={remote.error}
          loadingLabel={shared(
            remote.data ? "status.refreshing" : "status.loading",
          )}
          retryLabel={t("retry")}
          onRetry={remote.reload}
        />
        {remote.data ? (
          <ProblemList
            items={remote.data.items}
            status={status}
            empty={
              <ListEmpty>
                {status || view !== defaultView
                  ? shared("list.noResults")
                  : t("empty")}
              </ListEmpty>
            }
            renderItem={(problem) => (
              <ProblemListItem
                problem={problem}
                expanded={selected?.id === problem.id}
                onToggle={() => setSelected(problem)}
              />
            )}
          />
        ) : null}
      </ListLayout>
      <ProblemDetailSheet
        problem={selected}
        onClose={() => setSelected(null)}
        onChanged={(problem) => {
          setSelected(problem);
          remote.reload();
        }}
      />
    </main>
  );
}
function ProblemFilterOptions({
  value,
  onChange,
}: {
  value: ProblemFilters;
  onChange: (value: ProblemFilters) => void;
}) {
  const t = useTranslations("workspace");
  const shared = useTranslations("shared");
  const load = useCallback(
    () =>
      webApi.fetch(
        "/v1/problems/filter-options",
        v1.problems.problemFilterOptionsSchema,
        { cache: "no-store" },
      ),
    [],
  );
  const remote = useRemote(load);
  const common = {
    placeholder: shared("list.all"),
    clearOptionLabel: shared("list.all"),
    searchPlaceholder: shared("list.selectSearch"),
    clearSearchLabel: shared("list.selectClearSearch"),
    emptyMessage: shared("list.selectEmpty"),
    closeLabel: shared("actions.close"),
  };
  return (
    <>
      <ListStatus
        initial={!remote.data}
        loading={remote.loading}
        error={remote.error}
        loadingLabel={shared("status.loading")}
        retryLabel={t("retry")}
        onRetry={remote.reload}
      />
      <Field>
        <FieldLabel>{t("problems.scooter")}</FieldLabel>
        <SheetSelect
          {...common}
          label={t("problems.scooter")}
          value={value.scooterId}
          onValueChange={(scooterId) => onChange({ ...value, scooterId })}
          onClear={() => onChange({ ...value, scooterId: "" })}
          options={
            remote.data?.scooters?.map((scooter) => ({
              value: scooter.id,
              label: `${scooter.brandName} ${scooter.model ?? ""} · ${v1.scooters.scooterDisplayCode(scooter)}`,
            })) ?? []
          }
        />
      </Field>
      <Field>
        <FieldLabel>{t("problems.assignee")}</FieldLabel>
        <SheetSelect
          {...common}
          label={t("problems.assignee")}
          value={value.assigneeId}
          onValueChange={(assigneeId) => onChange({ ...value, assigneeId })}
          onClear={() => onChange({ ...value, assigneeId: "" })}
          options={[
            { value: "unassigned", label: t("problems.unassigned") },
            ...(remote.data?.assignees?.map((member) => ({
              value: member.id,
              label: memberName(member),
            })) ?? []),
          ]}
        />
      </Field>
    </>
  );
}
