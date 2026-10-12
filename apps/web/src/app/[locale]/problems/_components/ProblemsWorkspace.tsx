"use client";
import { useCallback, useState } from "react";
import { v1 } from "@repo/api-shared";
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Textarea,
  ListEmpty,
  ListFilterSheet,
  ListItems,
  ListLayout,
  ListPagination,
  ListStatus,
  SheetSelect,
} from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import {
  Choice,
  Feedback,
  useRemote,
  useTask,
} from "@/components/WorkspaceForm";
import { EntityPicker } from "@/components/EntityPicker";
import { PageTitleOverride } from "@/components/PageTitleOverride";
import { ProblemListItem } from "./ProblemListItem";

type ProblemFilters = {
  view: "assigned" | "available" | "all";
  status: v1.problems.Problem["status"] | "";
};

export function ProblemsWorkspace() {
  const t = useTranslations("workspace");
  const shared = useTranslations("shared");
  const { user } = useSession();
  const defaultView = canAccess(user, "problems.read", "ASSIGNED")
    ? "assigned"
    : canAccess(user, "problems.read", "AVAILABLE")
      ? "available"
      : "all";
  const [chosen, setChosen] = useState<ProblemFilters | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const filters: ProblemFilters = chosen ?? { view: defaultView, status: "" };
  const { view, status } = filters;
  const load = useCallback(() => {
    const query = new URLSearchParams({ view, page: String(page) });
    if (status) query.set("status", status);
    return webApi.fetch(
      `/v1/problems?${query}`,
      v1.problems.problemListSchema,
      { cache: "no-store" },
    );
  }, [view, status, page]);
  const remote = useRemote(load);
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
            defaultValue={{ view: defaultView, status: "" }}
            onApply={(value) => {
              setChosen(value);
              setPage(1);
              setSelected(null);
            }}
            appliedCount={
              Number(view !== defaultView) + Number(Boolean(status))
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
                  <FieldLabel htmlFor="service-view-filter">
                    {t("problems.view")}
                  </FieldLabel>
                  <SheetSelect
                    id="service-view-filter"
                    label={t("problems.view")}
                    value={value.view}
                    onValueChange={(view) =>
                      setValue({
                        ...value,
                        view: view as ProblemFilters["view"],
                      })
                    }
                    options={[
                      ...(canAccess(user, "problems.read", "ASSIGNED")
                        ? [{ value: "assigned", label: t("problems.mine") }]
                        : []),
                      ...(canAccess(user, "problems.read", "AVAILABLE")
                        ? [
                            {
                              value: "available",
                              label: t("problems.available"),
                            },
                          ]
                        : []),
                      ...(canAccess(user, "problems.read", "ALL")
                        ? [{ value: "all", label: t("problems.all") }]
                        : []),
                    ]}
                    searchPlaceholder={shared("list.selectSearch")}
                    clearSearchLabel={shared("list.selectClearSearch")}
                    emptyMessage={shared("list.selectEmpty")}
                    closeLabel={shared("actions.close")}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="service-status-filter">
                    {t("status")}
                  </FieldLabel>
                  <SheetSelect
                    id="service-status-filter"
                    label={t("status")}
                    value={value.status}
                    placeholder={shared("list.all")}
                    onValueChange={(status) =>
                      setValue({
                        ...value,
                        status: v1.problems.problemStatusSchema.parse(status),
                      })
                    }
                    options={v1.problems.problemStatusSchema.options.map(
                      (status) => ({
                        value: status,
                        label: t(`problems.${status}`),
                      }),
                    )}
                    onClear={() => setValue({ ...value, status: "" })}
                    clearOptionLabel={shared("list.all")}
                    searchPlaceholder={shared("list.selectSearch")}
                    clearSearchLabel={shared("list.selectClearSearch")}
                    emptyMessage={shared("list.selectEmpty")}
                    closeLabel={shared("actions.close")}
                  />
                </Field>
              </>
            )}
          </ListFilterSheet>
        }
        action={
          canAccess(user, "problems.create") ? (
            <Button onClick={() => setCreating(!creating)}>
              {creating ? t("cancel") : t("problems.add")}
            </Button>
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
        {creating ? (
          <CreateProblem
            onSaved={() => {
              setCreating(false);
              remote.reload();
            }}
          />
        ) : null}
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
          <ListItems
            items={remote.data.items}
            getItemKey={(problem) => problem.id}
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
                expanded={selected === problem.id}
                onToggle={() =>
                  setSelected(selected === problem.id ? null : problem.id)
                }
              >
                {selected === problem.id ? (
                  <ProblemWork
                    key={`${problem.id}-${problem.revision}`}
                    problem={problem}
                    reload={remote.reload}
                  />
                ) : null}
              </ProblemListItem>
            )}
          />
        ) : null}
      </ListLayout>
    </main>
  );
}
function CreateProblem({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations("workspace");
  const task = useTask();
  const [scooterId, setScooter] = useState("");
  const [description, setDescription] = useState("");
  return (
    <form
      className="flex flex-col gap-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void task.run(async () => {
          await webApi.fetch("/v1/problems", v1.problems.problemSchema, {
            method: "POST",
            json: v1.problems.createProblemInputSchema.parse({
              scooterId,
              description,
            }),
          });
          onSaved();
        });
      }}
    >
      <EntityPicker
        kind="scooters"
        label={t("problems.scooter")}
        value={scooterId}
        onChange={setScooter}
      />
      <Field>
        <FieldLabel htmlFor="problem-description">
          {t("description")}
        </FieldLabel>
        <Textarea
          id="problem-description"
          required
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <Feedback error={task.error} />
      <Button
        className="self-start"
        type="submit"
        disabled={task.busy || !scooterId}
      >
        {t("problems.add")}
      </Button>
    </form>
  );
}
function ProblemWork({
  problem,
  reload,
}: {
  problem: v1.problems.Problem;
  reload: () => void;
}) {
  const t = useTranslations("workspace");
  const { user } = useSession();
  const task = useTask();
  const [notes, setNotes] = useState(problem.workNotes ?? "");
  const [resolution, setResolution] = useState("");
  const [assignee, setAssignee] = useState(problem.assigneeId ?? "");
  const [priority, setPriority] = useState(problem.priority);
  const [confirm, setConfirm] = useState<string | null>(null);
  const mayAssign = canAccess(user, "problems.assign");
  const loadAssignees = useCallback(
    () =>
      mayAssign
        ? webApi.fetch(
            "/v1/problems/eligible-assignees",
            v1.problems.eligibleAssigneeListSchema,
            { cache: "no-store" },
          )
        : Promise.resolve({ items: [] }),
    [mayAssign],
  );
  const assignees = useRemote(loadAssignees);
  const own = problem.assigneeId === user?.id;
  const editable =
    problem.status === "open" || problem.status === "in_progress";
  const can = (action: string) =>
    canAccess(user, action, own ? "ASSIGNED" : "ALL");
  async function mutate(path: string, method: string, json: unknown) {
    await webApi.fetch(
      `/v1/problems/${problem.id}${path}`,
      v1.problems.problemSchema,
      { method, json },
    );
    reload();
  }
  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <Feedback error={task.error} success={task.success} />
      {problem.status === "open" &&
      !problem.assigneeId &&
      canAccess(user, "problems.claim", "AVAILABLE") ? (
        <Button
          className="self-start"
          disabled={task.busy}
          onClick={() =>
            void task.run(() =>
              mutate("/claim", "POST", { revision: problem.revision }),
            )
          }
        >
          {t("problems.claim")}
        </Button>
      ) : null}
      {editable && can("problems.update") ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void task.run(() =>
              mutate("", "PATCH", {
                revision: problem.revision,
                workNotes: notes,
              }),
            );
          }}
        >
          <Field>
            <FieldLabel htmlFor={`notes-${problem.id}`}>
              {t("problems.workNotes")}
            </FieldLabel>
            <Textarea
              id={`notes-${problem.id}`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <div className="flex gap-3">
            <Button type="submit" disabled={task.busy}>
              {t("save")}
            </Button>
            {problem.status === "open" ? (
              <Button
                type="button"
                variant="outline"
                disabled={task.busy}
                onClick={() =>
                  void task.run(() =>
                    mutate("", "PATCH", {
                      revision: problem.revision,
                      startWork: true,
                    }),
                  )
                }
              >
                {t("problems.start")}
              </Button>
            ) : null}
          </div>
        </form>
      ) : problem.workNotes ? (
        <p className="whitespace-pre-wrap text-sm">{problem.workNotes}</p>
      ) : null}
      {editable && can("problems.resolve") ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void task.run(() =>
              mutate("/resolve", "POST", {
                revision: problem.revision,
                resolutionNotes: resolution,
              }),
            );
          }}
        >
          <Field>
            <FieldLabel htmlFor={`resolution-${problem.id}`}>
              {t("problems.resolution")}
            </FieldLabel>
            <Textarea
              id={`resolution-${problem.id}`}
              required
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
            />
          </Field>
          <Button
            className="self-start"
            disabled={task.busy || !resolution.trim()}
          >
            {t("problems.resolve")}
          </Button>
        </form>
      ) : problem.resolutionNotes ? (
        <p className="whitespace-pre-wrap text-sm">{problem.resolutionNotes}</p>
      ) : null}
      {mayAssign && editable ? (
        <FieldGroup>
          <Choice
            label={t("problems.assignee")}
            value={assignee}
            onChange={setAssignee}
            options={[
              { value: "", label: t("problems.unassigned") },
              ...(assignees.data?.items.map((item) => ({
                value: item.id,
                label:
                  [item.firstName, item.lastName].filter(Boolean).join(" ") ||
                  item.id,
              })) ?? []),
            ]}
          />
          <Feedback error={assignees.error} />
          <Button
            className="self-start"
            variant="outline"
            disabled={task.busy}
            onClick={() =>
              void task.run(() =>
                mutate("/assignee", "PUT", {
                  revision: problem.revision,
                  assigneeId: assignee || null,
                }),
              )
            }
          >
            {t("problems.assign")}
          </Button>
        </FieldGroup>
      ) : null}
      {canAccess(user, "problems.prioritize") && editable ? (
        <div className="flex flex-wrap items-end gap-3">
          <Choice
            label={t("problems.priority")}
            value={priority}
            onChange={(value) =>
              setPriority(v1.problems.problemPrioritySchema.parse(value))
            }
            options={v1.problems.problemPrioritySchema.options.map((value) => ({
              value,
              label: t(`problems.${value}`),
            }))}
          />
          <Button
            variant="outline"
            disabled={task.busy}
            onClick={() =>
              void task.run(() =>
                mutate("/priority", "PUT", {
                  revision: problem.revision,
                  priority,
                }),
              )
            }
          >
            {t("save")}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {problem.status === "resolved" && canAccess(user, "problems.reopen") ? (
          <Button variant="outline" onClick={() => setConfirm("reopen")}>
            {t("problems.reopen")}
          </Button>
        ) : null}
        {editable && canAccess(user, "problems.update", "ALL") ? (
          <Button variant="outline" onClick={() => setConfirm("cancel")}>
            {t("problems.cancel")}
          </Button>
        ) : null}
      </div>
      {confirm ? (
        <div className="flex gap-3">
          <Button
            variant="destructive"
            disabled={task.busy}
            onClick={() =>
              void task.run(() =>
                mutate(`/${confirm}`, "POST", { revision: problem.revision }),
              )
            }
          >
            {t("access.confirm")}
          </Button>
          <Button variant="outline" onClick={() => setConfirm(null)}>
            {t("cancel")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
