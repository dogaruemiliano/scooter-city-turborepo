"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { v1 } from "@repo/api-shared";
import {
  Button,
  Field,
  FieldLabel,
  Input,
  ImageGalleryEditor,
  PersonRow,
  SegmentedRadioGroup,
  SheetSelect,
  Textarea,
} from "@repo/ui/components";
import { UserPlusIcon, UserMinusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import {
  Choice,
  Feedback,
  useRemote,
  useTask,
} from "@/components/WorkspaceForm";
import { ProblemScooterPicker } from "./ProblemScooterPicker";
import { ProblemChecklist } from "./ProblemChecklist";
import { ProblemPhotos } from "./ProblemPhotos";

export function memberName(
  member?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null,
) {
  return member
    ? [member.firstName, member.lastName].filter(Boolean).join(" ") || member.id
    : "";
}

export function useProblemAssignees(enabled: boolean) {
  const load = useCallback(
    () =>
      enabled
        ? webApi.fetch(
            "/v1/problems/eligible-assignees",
            v1.problems.eligibleAssigneeListSchema,
            { cache: "no-store" },
          )
        : Promise.resolve({ items: [] }),
    [enabled],
  );
  return useRemote(load);
}

export function CreateProblem({
  scooterId: preselected,
  onSaved,
  onCancel,
  stickyActions = false,
}: {
  scooterId?: string;
  onSaved: (problem: v1.problems.Problem) => void;
  onCancel?: () => void;
  stickyActions?: boolean;
}) {
  const t = useTranslations("workspace");
  const galleryT = useTranslations("scooters.photos");
  const editorT = useTranslations("persons.documentForm");
  const { user } = useSession();
  const id = useId();
  const task = useTask();
  const [scooterId, setScooter] = useState(preselected ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("");
  const [blocksUsage, setBlocks] = useState("");
  const [assigneeId, setAssignee] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const uploads = useRef(new Map<File, v1.problems.ProblemPhotoDraft>());
  const mayAssign = canAccess(user, "problems.assign", "ALL");
  const assignees = useProblemAssignees(mayAssign);

  async function uploadPhotos() {
    const photos: v1.problems.ProblemPhotoDraft[] = [];
    for (const file of files) {
      let draft = uploads.current.get(file);
      if (!draft) {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          await file.arrayBuffer(),
        );
        const checksumSha256 = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        const upload = await webApi.fetch(
          "/v1/problems/photo-draft-upload-url",
          v1.problems.problemPhotoUploadSchema,
          {
            method: "POST",
            json: v1.problems.createProblemPhotoUploadSchema.parse({
              contentType: file.type,
              byteSize: file.size,
              checksumSha256,
            }),
          },
        );
        const response = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: upload.headers,
          body: file,
          credentials: "omit",
        });
        if (!response.ok) throw new Error(t("problems.photoFailed"));
        draft = { uploadToken: upload.uploadToken, fileName: file.name };
        uploads.current.set(file, draft);
      }
      photos.push(draft);
    }
    return photos;
  }

  return (
    <form
      className={
        stickyActions ? "flex flex-1 flex-col gap-4" : "flex flex-col gap-4"
      }
      aria-label={t("problems.add")}
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocksUsage) return;
        void task.run(async () => {
          const input = v1.problems.createProblemInputSchema.parse({
            scooterId,
            title,
            severity,
            description,
            blocksUsage: blocksUsage === "defective",
            ...(mayAssign ? { assigneeId: assigneeId || null } : {}),
          });
          const photos = await uploadPhotos();
          const created = await webApi.fetch(
            "/v1/problems",
            v1.problems.problemSchema,
            {
              method: "POST",
              json: { ...input, photos },
            },
          );
          onSaved(created);
        });
      }}
    >
      {!preselected ? (
        <ProblemScooterPicker
          disabled={task.busy}
          value={scooterId}
          onChange={setScooter}
        />
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${id}-title`}>
          {t("problems.reportTitle")}
        </FieldLabel>
        <Input
          id={`${id}-title`}
          placeholder={t("problems.titlePlaceholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={160}
          disabled={task.busy}
        />
      </Field>
      <Field>
        <FieldLabel>{t("problems.severity")}</FieldLabel>
        <SegmentedRadioGroup
          label={t("problems.severity")}
          name={`${id}-severity`}
          value={severity}
          onValueChange={setSeverity}
          disabled={task.busy}
          showCheckmark
          aria-describedby={`${id}-severity-help`}
          options={v1.problems.problemSeveritySchema.options.map((value) => ({
            value,
            label: t(`problems.${value}`),
            severity: value,
          }))}
        />
        <p id={`${id}-severity-help`} className="text-sm text-muted-foreground">
          {t("problems.severityHelp")}
        </p>
      </Field>
      <Field>
        <FieldLabel>{t("problems.scooterCondition")}</FieldLabel>
        <SegmentedRadioGroup
          label={t("problems.scooterCondition")}
          name={`${id}-blocking`}
          value={blocksUsage}
          onValueChange={setBlocks}
          disabled={task.busy}
          required
          showCheckmark
          options={[
            {
              value: "functional",
              label: t("problems.functional"),
              tone: "success",
              colorUnselected: true,
            },
            {
              value: "defective",
              label: t("problems.defective"),
              tone: "destructive",
              colorUnselected: true,
            },
          ]}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-description`}>
          {t("problems.optionalDescription")}
        </FieldLabel>
        <Textarea
          id={`${id}-description`}
          placeholder={t("problems.descriptionPlaceholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
          disabled={task.busy}
        />
      </Field>
      {mayAssign ? (
        <Field>
          <FieldLabel>{t("problems.assignee")}</FieldLabel>
          {assignees.data?.items
            .filter((member) => member.id === assigneeId)
            .map((member) => (
              <div
                key={member.id}
                className="flex items-center rounded-2xl border border-border bg-card p-4 text-card-foreground"
              >
                <PersonRow
                  name={memberName(member)}
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      disabled={task.busy}
                      aria-label={t("problems.removeAssignee", {
                        name: memberName(member),
                      })}
                      onClick={() => setAssignee("")}
                    >
                      <UserMinusIcon aria-hidden="true" />
                    </Button>
                  }
                />
              </div>
            ))}
          <SheetSelect
            label={
              assigneeId
                ? t("problems.changeAssignee")
                : t("problems.addAssignee")
            }
            value={assigneeId}
            onValueChange={setAssignee}
            disabled={task.busy}
            className="h-auto min-h-20 justify-center rounded-dashed-surface border-(length:--dashed-surface-border-width) border-dashed bg-transparent p-4"
            triggerContent={
              <>
                <UserPlusIcon
                  aria-hidden="true"
                  className="size-5 text-muted-foreground"
                />
                <span>
                  {assigneeId
                    ? t("problems.changeAssignee")
                    : t("problems.addAssignee")}
                </span>
              </>
            }
            searchPlaceholder={t("problems.searchAssignees")}
            clearSearchLabel={t("problems.clearAssigneeSearch")}
            closeLabel={t("cancel")}
            emptyMessage={
              assignees.loading
                ? t("loading")
                : (assignees.error ?? t("problems.noAssignees"))
            }
            renderHeaderAction={
              assignees.error
                ? () => (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={assignees.reload}
                    >
                      {t("retry")}
                    </Button>
                  )
                : undefined
            }
            optionClassName="h-auto min-h-20 rounded-2xl border border-border p-4"
            options={
              assignees.data?.items.map((member) => ({
                value: member.id,
                label: memberName(member),
              })) ?? []
            }
            renderOption={(option) => (
              <PersonRow
                name={option.label}
                action={
                  <UserPlusIcon
                    aria-hidden="true"
                    className="size-5 text-muted-foreground"
                  />
                }
              />
            )}
          />
          <Feedback error={assignees.error} />
        </Field>
      ) : null}
      <Field>
        <FieldLabel>{t("problems.photos")}</FieldLabel>
        <ImageGalleryEditor
          files={files}
          disabled={task.busy}
          onBusyChange={setGalleryBusy}
          title={t("problems.photos")}
          accept={v1.scooters.SCOOTER_PHOTO_CONTENT_TYPES.join(",")}
          maxFiles={v1.problems.PROBLEM_PHOTO_MAX_FILES}
          maxFileSize={v1.scooters.SCOOTER_PHOTO_MAX_BYTES}
          onChange={(next) => {
            if (
              next.length > v1.problems.PROBLEM_PHOTO_MAX_FILES ||
              next.some(
                (file) =>
                  !v1.problems.createProblemPhotoUploadSchema.safeParse({
                    contentType: file.type,
                    byteSize: file.size,
                    checksumSha256: "0".repeat(64),
                  }).success,
              )
            ) {
              setFileError(t("problems.photoLimits"));
              return;
            }
            for (const file of uploads.current.keys())
              if (!next.includes(file)) uploads.current.delete(file);
            setFiles(next);
            setFileError(null);
          }}
          labels={{
            add: t("problems.choosePhotos"),
            edit: editorT("editPhoto"),
            remove: t("problems.removePhoto"),
            instructions: galleryT("sortInstructions"),
            deleteDrop: galleryT("deleteDrop"),
            deleteDropActive: galleryT("deleteDropActive"),
            open: (name) => galleryT("open", { name }),
            viewer: {
              close: galleryT("close"),
              previous: galleryT("previous"),
              next: galleryT("next"),
              grid: galleryT("grid"),
              zoomIn: galleryT("zoomIn"),
              zoomOut: galleryT("zoomOut"),
              resetZoom: galleryT("resetZoom"),
              loading: galleryT("imageLoading"),
              error: galleryT("imageFailed"),
              retry: galleryT("retry"),
              position: (index, count) =>
                galleryT("position", { index, count }),
            },
            editor: {
              title: editorT("editPhoto"),
              description: t("problems.editPhotoHelp"),
              cancel: editorT("cancelEdit"),
              reset: editorT("resetEdits"),
              rotatePhoto: editorT("rotatePhoto"),
              rotationZ: editorT("straightenPhoto"),
              rotationX: editorT("rotationX"),
              rotationY: editorT("rotationY"),
              adjustRotationZ: editorT("straightenPhoto"),
              adjustRotationX: editorT("adjustRotationX"),
              adjustRotationY: editorT("adjustRotationY"),
              imageAlt: t("problems.previewPhoto"),
              cropCorner: (corner) => editorT("cropCorner", { corner }),
              cropEdge: (edge) => editorT(`cropEdges.${edge}`),
              showEntirePhoto: editorT("showEntirePhoto"),
              save: t("problems.donePhotos"),
              saving: editorT("processingPhoto"),
              saveFailed: t("problems.photoFailed"),
              fileTooLarge: t("problems.photoLimits"),
            },
          }}
        />
        <p className="text-sm text-muted-foreground">
          {t("problems.photoLimits")}
        </p>
      </Field>
      <Feedback error={fileError ?? task.error} />
      <div
        data-slot="problem-create-actions"
        className={
          stickyActions
            ? "sticky bottom-0 z-sticky mt-auto flex flex-col gap-2 border-t border-border bg-background py-4 pb-[max(var(--spacing-4),env(safe-area-inset-bottom))]"
            : "flex flex-wrap gap-3"
        }
      >
        <Button
          className={stickyActions ? "w-full" : undefined}
          type="submit"
          disabled={
            task.busy ||
            galleryBusy ||
            !scooterId ||
            !title.trim() ||
            !severity ||
            !blocksUsage ||
            !!fileError
          }
        >
          {task.busy ? t("problems.reporting") : t("problems.add")}
        </Button>
        {onCancel ? (
          <Button
            variant="outline"
            type="button"
            disabled={task.busy}
            onClick={onCancel}
          >
            {t("cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function ProblemWork({
  problem,
  reload,
  onBusyChange,
}: {
  problem: v1.problems.Problem;
  reload: (problem?: v1.problems.Problem) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useTranslations("workspace");
  const { user } = useSession();
  const task = useTask();
  const [photosBusy, setPhotosBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [resolution, setResolution] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignee, setAssignee] = useState(problem.assigneeId ?? "");
  const [clearHold, setClearHold] = useState("");
  const [confirm, setConfirm] = useState<"reopen" | "cancel" | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(problem.title);
  const [description, setDescription] = useState(problem.description);
  const [severity, setSeverity] = useState(problem.severity ?? "");
  const editable =
    problem.status === "open" || problem.status === "in_progress";
  const own = problem.assigneeId === user?.id;
  const can = (action: string) =>
    canAccess(user, action, own ? "ASSIGNED" : "ALL");
  const mayAssign = canAccess(user, "problems.assign", "ALL");
  const assignees = useProblemAssignees(mayAssign && editable);
  const busy = task.busy || photosBusy;
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  async function mutate(
    path: string,
    method: string,
    input: Record<string, unknown>,
  ) {
    const updated = await webApi.fetch(
      `/v1/problems/${problem.id}${path}`,
      v1.problems.problemSchema,
      { method, json: { revision: problem.revision, ...input } },
    );
    reload(updated);
  }
  return (
    <div className="flex flex-col gap-6">
      <Feedback error={task.error} success={task.success} />
      {task.error ? (
        <Button
          variant="outline"
          className="self-start"
          disabled={busy}
          onClick={() => {
            assignees.reload();
            void task.run(async () => {
              const updated = await webApi.fetch(
                `/v1/problems/${problem.id}`,
                v1.problems.problemSchema,
                { cache: "no-store" },
              );
              reload(updated);
            });
          }}
        >
          {t("retry")}
        </Button>
      ) : null}
      <section
        className="flex flex-col gap-3"
        aria-label={t("problems.assignee")}
      >
        <h3 className="text-base font-semibold">{t("problems.assignee")}</h3>
        <div className="rounded-2xl border border-border p-4">
          <PersonRow
            name={memberName(problem.assignee) || t("problems.unassigned")}
            action={
              mayAssign && editable ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("problems.assign")}
                  disabled={busy}
                  onClick={() => setAssigning(!assigning)}
                >
                  <UserPlusIcon aria-hidden="true" />
                </Button>
              ) : undefined
            }
          />
        </div>
        {mayAssign && editable && assigning ? (
          <div className="flex flex-col gap-3">
            <Choice
              label={t("problems.assignee")}
              value={assignee}
              onChange={setAssignee}
              disabled={busy || assignees.loading}
              options={[
                { value: "", label: t("problems.unassigned") },
                ...(problem.assignee &&
                !assignees.data?.items.some(
                  (item) => item.id === problem.assigneeId,
                )
                  ? [
                      {
                        value: problem.assignee.id,
                        label: memberName(problem.assignee),
                      },
                    ]
                  : []),
                ...(assignees.data?.items.map((item) => ({
                  value: item.id,
                  label: memberName(item),
                })) ?? []),
              ]}
            />
            <Feedback error={assignees.error} />
            <Button
              className="self-start"
              variant="outline"
              disabled={busy || assignees.loading || !!assignees.error}
              onClick={() =>
                void task.run(() =>
                  mutate("/assignee", "PUT", { assigneeId: assignee || null }),
                )
              }
            >
              {t("problems.assign")}
            </Button>
          </div>
        ) : null}
      </section>
      {problem.status === "open" &&
      !problem.assigneeId &&
      canAccess(user, "problems.claim", "AVAILABLE") ? (
        <Button
          className="self-start"
          disabled={busy}
          onClick={() => void task.run(() => mutate("/claim", "POST", {}))}
        >
          {t("problems.claim")}
        </Button>
      ) : null}
      <ProblemChecklist
        key={JSON.stringify(problem.checklist)}
        problem={problem}
        editable={editable && can("problems.update")}
        busy={busy}
        onSave={(checklist) =>
          void task.run(() => mutate("", "PATCH", { checklist }))
        }
      />
      <ProblemPhotos
        problem={problem}
        editable={editable && can("problems.update")}
        disabled={task.busy}
        onBusyChange={setPhotosBusy}
        onReload={async () => {
          const updated = await webApi.fetch(
            `/v1/problems/${problem.id}`,
            v1.problems.problemSchema,
            { cache: "no-store" },
          );
          reload(updated);
        }}
        onSave={(photos) => mutate("", "PATCH", { photos })}
      />
      {problem.blocksUsage ? (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive p-4">
          <p className="text-sm font-medium">{t("problems.holdHelp")}</p>
          {editable &&
          (can("problems.resolve") ||
            canAccess(user, "problems.update", "ALL")) ? (
            <Choice
              label={t("problems.holdDecision")}
              value={clearHold}
              onChange={setClearHold}
              options={[
                { value: "", label: t("select") },
                { value: "retain", label: t("problems.retainHold") },
                { value: "clear", label: t("problems.clearThisHold") },
              ]}
            />
          ) : null}
        </div>
      ) : null}
      {editable && can("problems.resolve") ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void task.run(() =>
              mutate("/resolve", "POST", {
                resolutionNotes: resolution.trim(),
                ...(problem.blocksUsage
                  ? { clearMaintenanceHold: clearHold === "clear" }
                  : {}),
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
              placeholder={t("problems.resolutionPlaceholder")}
              required
              maxLength={4000}
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
            />
          </Field>
          <Button
            type="submit"
            className="self-start"
            disabled={
              busy || !resolution.trim() || (problem.blocksUsage && !clearHold)
            }
          >
            {t("problems.resolve")}
          </Button>
        </form>
      ) : null}
      {problem.resolutionNotes ? (
        <div>
          <p className="text-sm font-medium">
            {t("problems.previousResolution")}
          </p>
          <p className="whitespace-pre-wrap text-sm">
            {problem.resolutionNotes}
          </p>
        </div>
      ) : null}
      {editable && can("problems.update") ? (
        <>
          <div className="flex flex-wrap gap-3">
            {problem.status === "open" ? (
              <Button
                disabled={busy || !problem.assigneeId}
                onClick={() =>
                  void task.run(() => mutate("", "PATCH", { startWork: true }))
                }
              >
                {t("problems.start")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setEditing(!editing)}
            >
              {t("problems.editReport")}
            </Button>
          </div>
          {editing ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void task.run(() =>
                  mutate(
                    "",
                    "PATCH",
                    v1.problems.updateProblemInputSchema.parse({
                      revision: problem.revision,
                      title,
                      description,
                      ...(severity ? { severity } : {}),
                    }),
                  ),
                );
              }}
            >
              <Field>
                <FieldLabel htmlFor={`title-${problem.id}`}>
                  {t("problems.reportTitle")}
                </FieldLabel>
                <Input
                  id={`title-${problem.id}`}
                  placeholder={t("problems.titlePlaceholder")}
                  required
                  value={title}
                  maxLength={160}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Choice
                label={t("problems.severity")}
                value={severity}
                onChange={setSeverity}
                options={[
                  { value: "", label: t("problems.unassessed") },
                  ...v1.problems.problemSeveritySchema.options.map((value) => ({
                    value,
                    label: t(`problems.${value}`),
                  })),
                ]}
              />
              <Field>
                <FieldLabel htmlFor={`description-${problem.id}`}>
                  {t("problems.optionalDescription")}
                </FieldLabel>
                <Textarea
                  id={`description-${problem.id}`}
                  placeholder={t("problems.descriptionPlaceholder")}
                  value={description}
                  maxLength={4000}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={busy}>
                {t("save")}
              </Button>
            </form>
          ) : null}
        </>
      ) : null}
      {problem.workNotes ? (
        <div>
          <p className="text-sm font-medium">{t("problems.workNotes")}</p>
          <p className="whitespace-pre-wrap text-sm">{problem.workNotes}</p>
        </div>
      ) : null}
      {can("problems.update") ? (
        <Button
          className="self-start"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void task.run(() =>
              mutate("/hold", "PUT", { blocksUsage: !problem.blocksUsage }),
            )
          }
        >
          {problem.blocksUsage
            ? t("problems.clearHold")
            : t("problems.setHold")}
        </Button>
      ) : null}
      {problem.reporter ? (
        <p className="text-sm text-muted-foreground">
          {t("problems.reportedBy", { name: memberName(problem.reporter) })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {(problem.status === "resolved" || problem.status === "cancelled") &&
        canAccess(user, "problems.reopen") ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setConfirm("reopen")}
          >
            {t("problems.reopen")}
          </Button>
        ) : null}
        {editable && canAccess(user, "problems.update", "ALL") ? (
          <Button
            variant="outline"
            disabled={busy || (problem.blocksUsage && !clearHold)}
            onClick={() => setConfirm("cancel")}
          >
            {t("problems.cancel")}
          </Button>
        ) : null}
      </div>
      {confirm ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {t(
              confirm === "cancel"
                ? "problems.dismissHelp"
                : "problems.reopenHelp",
            )}
          </p>
          <div className="flex gap-3">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void task.run(() =>
                  mutate(
                    `/${confirm}`,
                    "POST",
                    confirm === "cancel" && problem.blocksUsage
                      ? { clearMaintenanceHold: clearHold === "clear" }
                      : {},
                  ),
                )
              }
            >
              {t("access.confirm")}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {can("problems.update") ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void task.run(async () => {
              await mutate("/comments", "POST", { body: comment.trim() });
              setComment("");
            });
          }}
        >
          <Field>
            <FieldLabel htmlFor={`comment-${problem.id}`}>
              {t("problems.comment")}
            </FieldLabel>
            <Textarea
              id={`comment-${problem.id}`}
              placeholder={t("problems.commentPlaceholder")}
              required
              maxLength={4000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </Field>
          <Button
            className="self-start"
            type="submit"
            disabled={busy || !comment.trim()}
          >
            {t("problems.addComment")}
          </Button>
        </form>
      ) : null}
      <ProblemActivity problemId={problem.id} />
    </div>
  );
}

function ProblemActivity({ problemId }: { problemId: string }) {
  const t = useTranslations("workspace");
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const load = useCallback(
    () =>
      webApi.fetch(
        `/v1/problems/${problemId}/activity?page=${page}`,
        v1.problems.problemActivityListSchema,
        { cache: "no-store" },
      ),
    [problemId, page],
  );
  const remote = useRemote(load);
  return (
    <section className="flex flex-col gap-3" aria-label={t("problems.history")}>
      <h3 className="text-base font-semibold">{t("problems.history")}</h3>
      <Feedback error={remote.error} />
      {remote.error ? (
        <Button
          className="self-start"
          variant="outline"
          onClick={remote.reload}
        >
          {t("retry")}
        </Button>
      ) : null}
      {remote.loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("loading")}
        </p>
      ) : null}
      {remote.data ? (
        <ol className="flex flex-col gap-4">
          {remote.data.items.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1 border-l pl-4">
              <p className="text-sm font-medium">
                {t(`problems.events.${entry.type}`)}
                {entry.actor ? ` · ${memberName(entry.actor)}` : ""}
              </p>
              <time
                className="text-xs text-muted-foreground"
                dateTime={entry.createdAt}
              >
                {new Date(entry.createdAt).toLocaleString(locale)}
              </time>
              {entry.before?.status &&
              entry.after?.status &&
              entry.before.status !== entry.after.status ? (
                <p className="text-sm">
                  {t(`problems.${entry.before.status}`)} →{" "}
                  {t(`problems.${entry.after.status}`)}
                </p>
              ) : null}
              {entry.after?.blocksUsage !== undefined &&
              entry.before?.blocksUsage !== entry.after.blocksUsage ? (
                <p className="text-sm">
                  {t(
                    entry.after.blocksUsage
                      ? "problems.blocksUsage"
                      : "problems.holdCleared",
                  )}
                </p>
              ) : null}
              {entry.before?.severity !== entry.after?.severity &&
              entry.after?.severity ? (
                <p className="text-sm">
                  {t("problems.severity")}:{" "}
                  {t(`problems.${entry.after.severity}`)}
                </p>
              ) : null}
              {entry.before?.assigneeId !== entry.after?.assigneeId &&
              entry.after?.assigneeId !== undefined ? (
                <p className="text-sm">
                  {t("problems.assignee")}:{" "}
                  {memberName(entry.after.assignee) || t("problems.unassigned")}
                </p>
              ) : null}
              {entry.note ? (
                <p className="whitespace-pre-wrap text-sm">{entry.note}</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {remote.data ? (
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={remote.loading || page === 1}
            onClick={() => setPage((v) => v - 1)}
          >
            {t("previous")}
          </Button>
          <Button
            variant="outline"
            disabled={
              remote.loading || page * remote.data.pageSize >= remote.data.total
            }
            onClick={() => setPage((v) => v + 1)}
          >
            {t("next")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
