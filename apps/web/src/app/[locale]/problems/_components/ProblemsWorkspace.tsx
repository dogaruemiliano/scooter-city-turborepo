"use client";
import { useCallback, useState } from "react";
import { v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Textarea,
} from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import {
  Choice,
  Feedback,
  RemoteState,
  useRemote,
  useTask,
  WorkspacePage,
} from "@/components/WorkspaceForm";
import { EntityPicker } from "@/components/EntityPicker";

export function ProblemsWorkspace() {
  const t = useTranslations("workspace");
  const { user } = useSession();
  const [chosen, setChosen] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const view =
    chosen ??
    (canAccess(user, "problems.read", "ASSIGNED")
      ? "assigned"
      : canAccess(user, "problems.read", "AVAILABLE")
        ? "available"
        : "all");
  const load = useCallback(
    () =>
      webApi.fetch(
        `/v1/problems?view=${view}&page=${page}`,
        v1.problems.problemListSchema,
        { cache: "no-store" },
      ),
    [view, page],
  );
  const remote = useRemote(load);
  const selectedProblem = remote.data?.items.find(
    (item) => item.id === selected,
  );
  return (
    <WorkspacePage
      title={t("problems.title")}
      description={t("problems.description")}
    >
      <div className="flex flex-wrap items-end gap-4">
        <Choice
          label={t("problems.view")}
          value={view}
          onChange={(value) => {
            setChosen(value);
            setPage(1);
            setSelected(null);
          }}
          options={[
            ...(canAccess(user, "problems.read", "ASSIGNED")
              ? [{ value: "assigned", label: t("problems.mine") }]
              : []),
            ...(canAccess(user, "problems.read", "AVAILABLE")
              ? [{ value: "available", label: t("problems.available") }]
              : []),
            ...(canAccess(user, "problems.read", "ALL")
              ? [{ value: "all", label: t("problems.all") }]
              : []),
          ]}
        />
        {canAccess(user, "problems.create") ? (
          <Button onClick={() => setCreating(!creating)}>
            {creating ? t("cancel") : t("problems.add")}
          </Button>
        ) : null}
      </div>
      {creating ? (
        <CreateProblem
          onSaved={() => {
            setCreating(false);
            remote.reload();
          }}
        />
      ) : null}
      {remote.error ? <Feedback error={remote.error} /> : null}
      {!remote.data ? (
        <RemoteState error={remote.error} retry={remote.reload} />
      ) : (
        <>
          <div className="divide-y rounded-lg border">
            {remote.data.items.map((problem) => (
              <article key={problem.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    variant="link"
                    className="justify-start"
                    onClick={() =>
                      setSelected(selected === problem.id ? null : problem.id)
                    }
                  >
                    {problem.scooter.brandName} {problem.scooter.model} ·{" "}
                    {problem.scooter.fleetNumber}
                  </Button>
                  <div className="flex gap-2">
                    {problem.assigneeNeedsReassignment ? (
                      <Badge variant="destructive">
                        {t("problems.reassignRequired")}
                      </Badge>
                    ) : null}
                    <Badge variant="secondary">
                      {t(`problems.${problem.status}`)}
                    </Badge>
                    <Badge variant="outline">
                      {t(`problems.${problem.priority}`)}
                    </Badge>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm">
                  {problem.description}
                </p>
                {selectedProblem?.id === problem.id ? (
                  <ProblemWork
                    key={`${problem.id}-${problem.revision}`}
                    problem={problem}
                    reload={remote.reload}
                  />
                ) : null}
              </article>
            ))}
          </div>
          {remote.data.items.length === 0 ? (
            <p className="text-muted-foreground">{t("empty")}</p>
          ) : null}
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              {t("previous")}
            </Button>
            <Button
              variant="outline"
              disabled={page * remote.data.pageSize >= remote.data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </>
      )}
    </WorkspacePage>
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
