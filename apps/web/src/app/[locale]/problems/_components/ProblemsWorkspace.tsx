"use client";

import { PageLayout } from "@repo/ui/components/page-layout";

import { ScooterSelect } from "@/components/ScooterSelect";
import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { InfiniteListFooter } from "@/components/InfiniteListFooter";
import {
  CheckCheck,
  CircleDot,
  List,
  Plus,
  UserRound,
  Wrench,
} from "lucide-react";
import { v1 } from "@repo/api-shared";
import {
  Field,
  FieldLabel,
  ListEmpty,
  ListFilterSheet,
  ListLayout,
  ListStatus,
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
import { AssigneeSelect } from "./AssigneeSelect";
import { PageTitleOverride } from "@/components/PageTitleOverride";
import { ProblemListItem } from "./ProblemListItem";
import { ProblemList } from "./ProblemList";

type ProblemFilters = {
  view: "assigned" | "available" | "";
  status: v1.problems.Problem["status"] | "";
  difficulty: v1.problems.Problem["difficulty"] | "";
  scooterId: string;
  assigneeIds: string[];
  blocking: "" | "true" | "false";
};

const EMPTY_ASSIGNEE_IDS: string[] = [];

const quickFilterIcons = {
  all: List,
  open: CircleDot,
  in_progress: Wrench,
  mine: UserRound,
  resolved: CheckCheck,
} as const;

export function ProblemsWorkspace({ todo = false }: { todo?: boolean }) {
  const t = useTranslations("workspace");
  const shared = useTranslations("shared");
  const { user } = useSession();
  const locale = resolveRouteLocale(useLocale());
  const defaultView = "";
  const [chosen, setChosen] = useState<ProblemFilters | null>(null);
  const filters: ProblemFilters = chosen ?? {
    view: defaultView,
    status: "",
    difficulty: "",
    scooterId: "",
    assigneeIds: EMPTY_ASSIGNEE_IDS,
    blocking: "",
  };
  const { view, status, difficulty, scooterId, assigneeIds, blocking } =
    filters;
  const loadPage = useCallback(
    async (page: number) => {
      const query = new URLSearchParams({
        ...(view ? { view } : {}),
        page: String(page),
        ...(todo ? { kind: "todo" } : {}),
      });
      if (status) query.set("status", status);
      if (difficulty) query.set("difficulty", difficulty);
      if (scooterId) query.set("scooterId", scooterId);
      const assignedIds = assigneeIds.filter((id) => id !== "unassigned");
      if (assignedIds.length) query.set("assigneeIds", assignedIds.join(","));
      if (assigneeIds.includes("unassigned")) query.set("unassigned", "true");
      if (blocking) query.set("blocking", blocking);
      const result = await webApi.fetch(
        `/v1/problems?${query}`,
        v1.problems.problemListSchema,
        { cache: "no-store" },
      );
      if (result.quickFilterCounts) return result;
      const countKeys = [
        "all",
        "open",
        "in_progress",
        "mine",
        "resolved",
      ] as const;
      const totals = await Promise.all(
        countKeys.map(async (key) => {
          const countQuery = new URLSearchParams({
            page: "1",
            pageSize: "1",
            ...(todo ? { kind: "todo" } : {}),
          });
          if (difficulty) countQuery.set("difficulty", difficulty);
          if (scooterId) countQuery.set("scooterId", scooterId);
          if (blocking) countQuery.set("blocking", blocking);
          if (key === "mine") countQuery.set("view", "assigned");
          else if (key !== "all") countQuery.set("status", key);
          const response = await webApi.fetch(
            `/v1/problems?${countQuery}`,
            v1.problems.problemListSchema,
            { cache: "no-store" },
          );
          return response.total;
        }),
      );
      return {
        ...result,
        quickFilterCounts: {
          all: totals[0]!,
          open: totals[1]!,
          in_progress: totals[2]!,
          mine: totals[3]!,
          resolved: totals[4]!,
        },
      };
    },
    [view, status, difficulty, scooterId, assigneeIds, blocking, todo],
  );
  const requestVersion = useRef(0);
  const appendPending = useRef(false);
  const [appendLoading, setAppendLoading] = useState(false);
  const [appendError, setAppendError] = useState<string | null>(null);
  const load = useCallback(() => {
    requestVersion.current += 1;
    appendPending.current = false;
    setAppendLoading(false);
    setAppendError(null);
    return loadPage(1);
  }, [loadPage]);
  const remote = useRemote(load);
  const { data, loading, error, setData } = remote;
  const hasMore = Boolean(data && data.page * data.pageSize < data.total);

  useEffect(
    () => () => {
      requestVersion.current += 1;
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (!data || loading || error || !hasMore || appendPending.current) return;
    const version = requestVersion.current;
    appendPending.current = true;
    setAppendLoading(true);
    setAppendError(null);
    try {
      const next = await loadPage(data.page + 1);
      if (version !== requestVersion.current) return;
      setData((current) => {
        if (!current) return next;
        const items = new Map(current.items.map((item) => [item.id, item]));
        for (const item of next.items) items.set(item.id, item);
        return { ...next, items: [...items.values()] };
      });
    } catch (cause) {
      if (version === requestVersion.current)
        setAppendError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (version === requestVersion.current) {
        appendPending.current = false;
        setAppendLoading(false);
      }
    }
  }, [data, loading, error, hasMore, loadPage, setData]);
  const quickFilter = assigneeIds.length
    ? "custom"
    : view === "assigned"
      ? status
        ? "custom"
        : "mine"
      : status === "open"
        ? "open"
        : status === "resolved" || status === "in_progress"
          ? status
          : status
            ? "custom"
            : view
              ? "custom"
              : "all";
  const mayReadMine = canAccess(user, "problems.read", "ASSIGNED");
  const quickFilterLabel = (
    key: "all" | "open" | "in_progress" | "mine" | "resolved",
  ) => {
    const Icon = quickFilterIcons[key];
    return (
      <>
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {t(`problems.quickFilters.${key}`)}
        {remote.data?.quickFilterCounts ? (
          <>
            {" "}
            <span className="tabular-nums">
              {remote.data.quickFilterCounts[key]}
            </span>
          </>
        ) : null}
      </>
    );
  };

  return (
    <PageLayout aria-busy={remote.loading} className="overflow-x-clip">
      <PageTitleOverride title={t(todo ? "todos.title" : "problems.title")} />
      <ListLayout
        summary={
          remote.data && remote.error ? shared("list.staleResults") : undefined
        }
        filters={
          <ListFilterSheet<ProblemFilters>
            value={filters}
            defaultValue={{
              view: defaultView,
              status: "",
              difficulty: "",
              scooterId: "",
              assigneeIds: [],
              blocking: "",
            }}
            onApply={(value) => {
              setChosen(value);
            }}
            appliedCount={
              Number(view !== defaultView) +
              [
                status,
                difficulty,
                scooterId,
                assigneeIds.length,
                blocking,
              ].filter(Boolean).length
            }
            title={shared("list.filters")}
            applyLabel={shared("list.apply")}
            applyingLabel={shared("list.applying")}
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
                {!todo ? (
                  <Field>
                    <FieldLabel>{t("problems.difficulty")}</FieldLabel>
                    <SegmentedRadioGroup
                      id="service-difficulty-filter"
                      name="service-difficulty-filter"
                      label={t("problems.difficulty")}
                      value={value.difficulty ?? ""}
                      deselectValue=""
                      columns={3}
                      showCheckmark
                      onValueChange={(difficulty) =>
                        setValue({ ...value, difficulty })
                      }
                      options={v1.problems.problemDifficultySchema.options.map(
                        (difficulty) => ({
                          value: difficulty,
                          label: t(`problems.${difficulty}`),
                          difficulty,
                        }),
                      )}
                    />
                  </Field>
                ) : null}
                <ProblemFilterOptions
                  todo={todo}
                  value={value}
                  onChange={setValue}
                />
                {!todo ? (
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
                ) : null}
              </>
            )}
          </ListFilterSheet>
        }
        action={
          canAccess(user, "problems.create") ? (
            <Link
              href={localizePath(todo ? "/todos/new" : "/problems/new", locale)}
              className={buttonVariants()}
            >
              <Plus aria-hidden="true" data-icon="inline-start" />
              {t(todo ? "todos.add" : "problems.add")}
            </Link>
          ) : undefined
        }
        footer={
          !remote.loading && !remote.error && (hasMore || appendError) ? (
            <InfiniteListFooter
              hasMore={hasMore}
              loading={appendLoading}
              error={appendError}
              onLoadMore={loadMore}
            />
          ) : undefined
        }
      >
        <SegmentedRadioGroup
          appearance="pills"
          containerClassName="relative -mx-4 overflow-x-auto overscroll-x-contain md:-mx-8"
          className="w-max min-w-full flex-nowrap px-4 md:px-8"
          optionClassName="shrink-0 whitespace-nowrap"
          name="problem-quick-filter"
          label={t("problems.quickFilters.label")}
          value={quickFilter}
          deselectValue=""
          options={[
            {
              value: "all",
              label: quickFilterLabel("all"),
              tone: "secondary",
              colorUnselected: true,
              subtleUnselected: true,
            },
            {
              value: "open",
              label: quickFilterLabel("open"),
              tone: "info",
              colorUnselected: true,
              subtleUnselected: true,
            },
            {
              value: "in_progress",
              label: quickFilterLabel("in_progress"),
              tone: "warning",
              colorUnselected: true,
              subtleUnselected: true,
            },
            ...(mayReadMine
              ? [
                  {
                    value: "mine",
                    label: quickFilterLabel("mine"),
                    tone: "personal" as const,
                    colorUnselected: true,
                    subtleUnselected: true,
                  },
                ]
              : []),
            {
              value: "resolved",
              label: quickFilterLabel("resolved"),
              tone: "success",
              colorUnselected: true,
              subtleUnselected: true,
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
                  : next === "resolved" || next === "in_progress"
                    ? next
                    : "",
              assigneeIds: [],
            });
          }}
        />
        <ListStatus
          initial={!remote.data}
          loading={remote.loading && !remote.data}
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
                href={localizePath(
                  `${todo ? "/todos" : "/problems"}/${encodeURIComponent(problem.id)}`,
                  locale,
                )}
              />
            )}
          />
        ) : null}
      </ListLayout>
    </PageLayout>
  );
}
function ProblemFilterOptions({
  todo,
  value,
  onChange,
}: {
  todo: boolean;
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
  const scooters = useMemo(
    () =>
      (remote.data?.scooters ?? []).map((scooter) => ({
        ...scooter,
        brand: scooter.brandName,
      })),
    [remote.data],
  );
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
      {!todo ? (
        <Field>
          <FieldLabel>{t("problems.scooter")}</FieldLabel>
          <ScooterSelect
            {...common}
            label={t("problems.scooter")}
            value={value.scooterId}
            onValueChange={(scooterId) => onChange({ ...value, scooterId })}
            onClear={() => onChange({ ...value, scooterId: "" })}
            scooters={scooters}
          />
        </Field>
      ) : null}
      <Field>
        <FieldLabel>{t("problems.assignee")}</FieldLabel>
        <AssigneeSelect
          multiple
          label={t("problems.assignee")}
          value={value.assigneeIds}
          onValueChange={(assigneeIds) => onChange({ ...value, assigneeIds })}
          onClear={() => onChange({ ...value, assigneeIds: [] })}
          clearOptionLabel={shared("list.all")}
          members={remote.data?.assignees ?? []}
          includeUnassigned
          loading={remote.loading}
        />
      </Field>
    </>
  );
}
