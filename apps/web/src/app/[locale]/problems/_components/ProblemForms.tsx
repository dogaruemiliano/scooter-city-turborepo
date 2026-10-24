"use client";
import { userAvatarSrc } from "@/lib/user-avatar";
import { useFormAction } from "@/lib/form/use-form-action";
import { SaveButton } from "@repo/ui/components/save-button";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { v1 } from "@repo/api-shared";
import {
  Button,
  ActivityTimeline,
  ActivityTimelineItem,
  CommentThread,
  CommentItem,
  CommentEventItem,
  CommentComposer,
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetClose,
  Field,
  FieldLabel,
  FormActions,
  Input,
  ImageGalleryEditor,
  SegmentedRadioGroup,
  Textarea,
} from "@repo/ui/components";
import {
  FilePlus,
  Pencil,
  Users,
  Play,
  Pause,
  CircleCheck,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  CircleSlash,
  Flag,
  MoreVertical,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useWorkspaceNotifications } from "@/components/WorkspaceNotifications";
import { PageHeaderActions } from "@/components/PageHeaderActions";
import { ProblemAssignment } from "./ProblemAssignment";
import { AssigneeSelect } from "./AssigneeSelect";
import { memberName } from "../_lib/member-name";
export { memberName } from "../_lib/member-name";
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
import { ProblemSections, type ProblemSectionData } from "./ProblemSections";
import { ProblemPhotos } from "./ProblemPhotos";

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
  const formAction = useFormAction();
  const notifications = useWorkspaceNotifications();

  const t = useTranslations("workspace");
  const galleryT = useTranslations("scooters.photos");
  const editorT = useTranslations("persons.documentForm");
  const { user } = useSession();
  const id = useId();
  const task = useTask();
  const [scooterId, setScooter] = useState(preselected ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [blocksUsage, setBlocks] = useState("");
  const [assigneeIds, setAssignees] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [sectionsBusy, setSectionsBusy] = useState(false);
  const [sectionData, setSectionData] = useState<ProblemSectionData>({
    sections: [],
    checklist: [],
    buyList: [],
    location: null,
  });
  const [fileError, setFileError] = useState<string | null>(null);
  const uploads = useRef(new Map<File, v1.problems.ProblemPhotoDraft>());
  const mayAssign = canAccess(user, "problems.assign", "ALL");
  const assignees = useProblemAssignees(mayAssign);

  const readyToSubmit = Boolean(
    scooterId &&
    title.trim() &&
    difficulty &&
    blocksUsage &&
    !fileError &&
    !galleryBusy &&
    !sectionsBusy,
  );

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
            ...sectionData,
            scooterId,
            title,
            difficulty,
            description,
            blocksUsage: blocksUsage === "defective",
            ...(mayAssign ? { assigneeIds } : {}),
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
          notifications?.add({
            title: t("problems.reported"),
            variant: "success",
          });
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
        <FieldLabel>{t("problems.difficulty")}</FieldLabel>
        <SegmentedRadioGroup
          label={t("problems.difficulty")}
          name={`${id}-difficulty`}
          columns={3}
          value={difficulty}
          onValueChange={setDifficulty}
          disabled={task.busy}
          showCheckmark
          aria-describedby={`${id}-difficulty-help`}
          options={v1.problems.problemDifficultySchema.options.map((value) => ({
            value,
            label: t(`problems.${value}`),
            difficulty: value,
          }))}
        />
        <p
          id={`${id}-difficulty-help`}
          className="text-sm text-muted-foreground"
        >
          {t("problems.difficultyHelp")}
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
          <AssigneeSelect
            multiple
            value={assigneeIds}
            onValueChange={setAssignees}
            members={assignees.data?.items ?? []}
            disabled={task.busy}
            loading={assignees.loading}
            error={assignees.error}
            onRetry={assignees.reload}
          />
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
      <ProblemSections
        problem={sectionData}
        editable
        maySaveLocation={canAccess(user, "problems.update", "ALL")}
        busy={task.busy || sectionsBusy}
        onBusyChange={setSectionsBusy}
        onSave={async (input) => {
          setSectionData((current) => ({ ...current, ...input }));
        }}
      />
      <Feedback error={fileError ?? task.error} />
      <FormActions
        data-slot="problem-create-actions"
        arrangement="split"
        ready={stickyActions ? readyToSubmit : undefined}
        pending={task.busy}
        className={stickyActions ? "mt-auto w-full" : undefined}
      >
        <SaveButton
          className={stickyActions ? "w-full" : undefined}
          type="submit"
          disabled={task.busy || !readyToSubmit}
          {...formAction("report", { pending: task.busy, error: task.error })}
        />
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
      </FormActions>
    </form>
  );
}

export function ProblemWork({
  problem,
  reload,
  onBusyChange,
  compact = false,
  actionsTarget,
}: {
  compact?: boolean;
  actionsTarget?: HTMLElement | null;
  problem: v1.problems.Problem;
  reload: (problem?: v1.problems.Problem) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const formAction = useFormAction();
  const notifications = useWorkspaceNotifications();

  const t = useTranslations("workspace");
  const { user } = useSession();
  const task = useTask();
  const commentTask = useTask();
  const [photosBusy, setPhotosBusy] = useState(false);
  const [sectionsBusy, setSectionsBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [postedComment, setPostedComment] = useState<{
    body: string;
    actorId?: string;
  } | null>(null);
  const [reopenMessage, setReopenMessage] = useState("");
  const [resolution, setResolution] = useState("");
  const [confirm, setConfirm] = useState<"reopen" | "cancel" | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(problem.title);
  const [description, setDescription] = useState(problem.description);
  const [difficulty, setDifficulty] = useState(problem.difficulty ?? "");
  const editable =
    problem.status === "open" || problem.status === "in_progress";
  const assignedMembers = v1.problems.problemAssignees(problem);
  const assignedIds = assignedMembers.map((member) => member.id);
  const own = assignedIds.includes(user?.id ?? "");
  const can = (action: string) =>
    canAccess(user, action, own ? "ASSIGNED" : "ALL");
  const mayAssign = canAccess(user, "problems.assign", "ALL");
  const assignees = useProblemAssignees(mayAssign && editable);
  const busy = task.busy || commentTask.busy || photosBusy || sectionsBusy;
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
    const message = input.startWork
      ? "workStarted"
      : input.pauseWork
        ? "workPaused"
        : path === "/resolve"
          ? "taskCompleted"
          : path === "/assignee"
            ? "assigneesSaved"
            : path === "/comments"
              ? "commentAdded"
              : "changesSaved";
    notifications?.add({
      title: t(`problems.notifications.${message}`),
      variant: "success",
    });
    reload(updated);
  }
  const retryAction = task.error ? (
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
  ) : null;
  return (
    <div className="flex flex-col gap-8">
      <Feedback error={task.error} />
      {retryAction}
      <ProblemAssignment
        problem={problem}
        userId={user?.id}
        mayAssign={mayAssign}
        mayClaim={canAccess(user, "problems.claim", "AVAILABLE")}
        busy={busy}
        members={assignees.data?.items ?? []}
        loading={assignees.loading}
        error={assignees.error}
        onRetry={assignees.reload}
        saveError={task.error}
        onAssign={async (assigneeIds) => {
          let saved = false;
          await task.run(async () => {
            await mutate("/assignee", "PUT", { assigneeIds });
            saved = true;
          });
          return saved;
        }}
        onClaim={() => void task.run(() => mutate("/claim", "POST", {}))}
      />
      <ProblemSections
        problem={problem}
        editable={editable && can("problems.update")}
        maySaveLocation={canAccess(user, "problems.update", "ALL")}
        busy={busy}
        onBusyChange={setSectionsBusy}
        onSave={(input) => mutate("", "PATCH", input)}
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
      {problem.status === "open" && can("problems.update") ? (
        <Button
          className={
            compact
              ? "sticky bottom-4 z-sticky order-last w-full shadow-primary"
              : "self-start"
          }
          disabled={busy || !assignedIds.length}
          onClick={() =>
            void task.run(() => mutate("", "PATCH", { startWork: true }))
          }
        >
          {t("problems.start")}
        </Button>
      ) : null}
      {!compact ||
      (problem.status === "in_progress" && can("problems.resolve")) ? (
        <ProblemWorkPanel
          compact={compact}
          title={t("problems.completeTask")}
          primary={problem.status === "in_progress" && can("problems.resolve")}
        >
          {compact ? (
            <>
              <Feedback error={task.error} />
              {retryAction}
            </>
          ) : null}
          {problem.status === "in_progress" && can("problems.resolve") ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void task.run(() =>
                  mutate("/resolve", "POST", {
                    resolutionNotes: resolution.trim(),
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
              <SaveButton
                type="submit"
                className="w-full"
                disabled={busy || !resolution.trim()}
                {...formAction("complete", {
                  pending: busy,
                  error: task.error,
                })}
              />
            </form>
          ) : null}
        </ProblemWorkPanel>
      ) : null}
      <ProblemWorkPanel
        compact={compact}
        actionsTarget={actionsTarget}
        title={t("problems.moreActions")}
      >
        {compact ? (
          <>
            <Feedback error={task.error} />
            {retryAction}
          </>
        ) : null}
        {problem.status === "in_progress" && can("problems.update") ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void task.run(() => mutate("", "PATCH", { pauseWork: true }))
            }
          >
            {t("problems.pause")}
          </Button>
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
                        ...(difficulty ? { difficulty } : {}),
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
                  label={t("problems.difficulty")}
                  value={difficulty}
                  onChange={setDifficulty}
                  options={[
                    { value: "", label: t("problems.unassessed") },
                    ...v1.problems.problemDifficultySchema.options.map(
                      (value) => ({
                        value,
                        label: t(`problems.${value}`),
                      }),
                    ),
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
                <SaveButton
                  type="submit"
                  disabled={busy}
                  {...formAction("save", { pending: busy, error: task.error })}
                />
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
        {editable && can("problems.update") ? (
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
              disabled={busy}
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
            {confirm === "reopen" ? (
              <Field>
                <FieldLabel htmlFor={`reopen-${problem.id}`}>
                  {t("problems.reopenMessage")}
                </FieldLabel>
                <Textarea
                  id={`reopen-${problem.id}`}
                  required
                  maxLength={4000}
                  value={reopenMessage}
                  disabled={busy}
                  onChange={(event) => setReopenMessage(event.target.value)}
                  placeholder={t("problems.reopenMessagePlaceholder")}
                />
              </Field>
            ) : null}
            <div className="flex gap-3">
              <SaveButton
                variant={confirm === "reopen" ? "warning" : "destructive"}
                disabled={
                  busy || (confirm === "reopen" && !reopenMessage.trim())
                }
                onClick={() =>
                  void task.run(async () => {
                    await mutate(
                      `/${confirm}`,
                      "POST",
                      confirm === "reopen"
                        ? { message: reopenMessage.trim() }
                        : {},
                    );
                    setConfirm(null);
                    setReopenMessage("");
                  })
                }
                {...formAction(
                  "confirm",
                  { pending: busy, error: task.error },
                  t(
                    confirm === "reopen" ? "problems.reopen" : "access.confirm",
                  ),
                )}
              />
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
      </ProblemWorkPanel>
      <ProblemActivity
        problemId={problem.id}
        revision={problem.revision}
        postedComment={postedComment}
        onCommentAnimated={() => setPostedComment(null)}
        composer={
          can("problems.update") ? (
            <CommentComposer
              label={t("problems.comment")}
              placeholder={t("problems.commentPlaceholder")}
              value={comment}
              onValueChange={setComment}
              maxLength={4000}
              disabled={busy || commentTask.error === t("conflict")}
              error={commentTask.error}
              recovery={
                commentTask.error ? (
                  <Button
                    variant="outline"
                    className="self-start"
                    disabled={busy}
                    onClick={() =>
                      void commentTask.run(async () => {
                        const updated = await webApi.fetch(
                          `/v1/problems/${problem.id}`,
                          v1.problems.problemSchema,
                          { cache: "no-store" },
                        );
                        reload(updated);
                      })
                    }
                  >
                    {t("retry")}
                  </Button>
                ) : undefined
              }
              submitButton={formAction("comment", {
                pending: commentTask.busy,
                error: commentTask.error,
              })}
              onSubmit={(event) => {
                event.preventDefault();
                void commentTask.run(async () => {
                  const body = comment.trim();
                  await mutate("/comments", "POST", { body });
                  setPostedComment({ body, actorId: user?.id });
                  setComment("");
                });
              }}
            />
          ) : undefined
        }
      />
    </div>
  );
}

function ProblemWorkPanel({
  actionsTarget,
  compact,
  title,
  primary = false,
  children,
}: {
  actionsTarget?: HTMLElement | null;
  compact: boolean;
  title: string;
  primary?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("workspace");
  const shared = useTranslations("shared.actions");
  if (!compact) return <>{children}</>;
  return (
    <BottomSheet>
      {primary ? (
        <BottomSheetTrigger
          render={
            <Button className="sticky bottom-4 z-sticky order-last w-full shadow-primary" />
          }
        >
          {title}
        </BottomSheetTrigger>
      ) : (
        <PageHeaderActions desktopTarget={actionsTarget}>
          <BottomSheetTrigger
            render={<Button variant="outline" size="icon" aria-label={title} />}
          >
            <MoreVertical aria-hidden="true" />
          </BottomSheetTrigger>
        </PageHeaderActions>
      )}
      <BottomSheetContent>
        <BottomSheetHeader
          className={
            primary ? "flex-row items-center justify-between gap-3" : undefined
          }
        >
          <BottomSheetTitle>{title}</BottomSheetTitle>
          {primary ? (
            <BottomSheetClose
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden shrink-0 lg:inline-flex"
                />
              }
              aria-label={shared("close")}
            >
              <X aria-hidden="true" />
            </BottomSheetClose>
          ) : null}
        </BottomSheetHeader>
        <BottomSheetBody className="gap-6">{children}</BottomSheetBody>
        {!primary ? (
          <BottomSheetFooter>
            <BottomSheetClose render={<Button variant="outline" />}>
              {t("cancel")}
            </BottomSheetClose>
          </BottomSheetFooter>
        ) : null}
      </BottomSheetContent>
    </BottomSheet>
  );
}

function activityAppearance(entry: v1.problems.ProblemActivity) {
  if (entry.before?.status !== entry.after?.status) {
    if (entry.after?.status === "in_progress")
      return { icon: Play, tone: "info" as const, label: "workStarted" };
    if (
      entry.before?.status === "in_progress" &&
      entry.after?.status === "open"
    )
      return { icon: Pause, tone: "warning" as const, label: "workPaused" };
  }
  if (
    entry.type === "PROBLEM_HOLD_CHANGED" ||
    (entry.after?.blocksUsage !== undefined &&
      entry.before?.blocksUsage !== entry.after.blocksUsage)
  )
    return {
      icon: entry.after?.blocksUsage ? ShieldAlert : ShieldCheck,
      tone: entry.after?.blocksUsage
        ? ("destructive" as const)
        : ("success" as const),
    };
  const variants = {
    PROBLEM_CREATED: { icon: FilePlus, tone: "neutral" },
    PROBLEM_UPDATED: { icon: Pencil, tone: "neutral" },
    PROBLEM_CLAIMED: { icon: Users, tone: "info" },
    PROBLEM_ASSIGNED: { icon: Users, tone: "info" },
    PROBLEM_RESOLVED: { icon: CircleCheck, tone: "success" },
    PROBLEM_REOPENED: { icon: RotateCcw, tone: "warning" },
    PROBLEM_PRIORITIZED: { icon: Flag, tone: "warning" },
    PROBLEM_CANCELLED: { icon: CircleSlash, tone: "neutral" },
    PROBLEM_COMMENTED: { icon: Pencil, tone: "neutral" },
  } as const;
  return (
    variants[entry.type as keyof typeof variants] ?? {
      icon: Pencil,
      tone: "neutral" as const,
    }
  );
}

function ProblemActivity({
  kind = "comments",
  postedComment,
  onCommentAnimated,
  revision,
  problemId,
  composer,
}: {
  problemId: string;
  kind?: "comments" | "activity";
  revision?: number;
  postedComment?: { body: string; actorId?: string } | null;
  onCommentAnimated?: () => void;
  composer?: ReactNode;
}) {
  const t = useTranslations("workspace");
  const locale = useLocale();
  const { user } = useSession();
  const [page, setPage] = useState(1);
  const load = useCallback(
    () =>
      webApi.fetch(
        `/v1/problems/${problemId}/activity?page=${page}&kind=${kind}`,
        v1.problems.problemActivityListSchema,
        { cache: "no-store" },
      ),
    [problemId, page, kind],
  );
  const remote = useRemote(load);
  const [latestPage, setLatestPage] = useState<typeof remote.data>(null);
  if (
    kind === "activity" &&
    page === 1 &&
    !remote.loading &&
    remote.data !== latestPage
  )
    setLatestPage(remote.data);
  const seenCommentIds = useRef(new Set<string>());
  const [enteringCommentId, setEnteringCommentId] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (!remote.data || remote.loading) return;
    const comments = remote.data.items.filter(
      (entry) => entry.type === "PROBLEM_COMMENTED",
    );
    if (postedComment) {
      const added = comments.find(
        (entry) =>
          !seenCommentIds.current.has(entry.id) &&
          entry.note === postedComment.body &&
          entry.actor?.id === postedComment.actorId,
      );
      if (added) {
        setEnteringCommentId(added.id);
        onCommentAnimated?.();
      }
    }
    for (const entry of comments) seenCommentIds.current.add(entry.id);
  }, [remote.data, remote.loading, postedComment, onCommentAnimated]);
  const previousRevision = useRef(revision);
  const reloadActivity = remote.reload;
  useEffect(() => {
    if (previousRevision.current === revision) return;
    previousRevision.current = revision;
    setPage(1);
    reloadActivity();
  }, [revision, reloadActivity]);
  const content = (
    <>
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
      {remote.data && !remote.data.items.length ? (
        <p className="text-sm text-muted-foreground">
          {t(
            kind === "comments"
              ? "problems.noComments"
              : "problems.noSystemActivity",
          )}
        </p>
      ) : null}
      {remote.data ? (
        <ol className="flex flex-col gap-4">
          {remote.data.items
            .filter((entry) =>
              kind === "comments"
                ? (
                    v1.problems.problemConversationTypes as readonly string[]
                  ).includes(entry.type)
                : entry.type !== "PROBLEM_COMMENTED",
            )
            .map((entry) =>
              kind === "comments" && entry.type !== "PROBLEM_COMMENTED" ? (
                <CommentEventItem
                  key={entry.id}
                  kind={
                    entry.type === "PROBLEM_RESOLVED" ? "completed" : "reopened"
                  }
                  label={t(
                    entry.type === "PROBLEM_RESOLVED"
                      ? "problems.taskCompletedComment"
                      : "problems.taskReopenedComment",
                  )}
                  avatarUrl={userAvatarSrc(entry.actor?.avatarAssetId)}
                  author={
                    entry.actor
                      ? memberName(entry.actor)
                      : t("problems.unknownAuthor")
                  }
                  dateTime={entry.createdAt}
                  timestamp={new Date(entry.createdAt).toLocaleString(locale)}
                >
                  {entry.note || t("problems.noTransitionMessage")}
                </CommentEventItem>
              ) : entry.type === "PROBLEM_COMMENTED" ? (
                <CommentItem
                  key={entry.id}
                  animateEntrance={entry.id === enteringCommentId}
                  onAnimationEnd={() =>
                    setEnteringCommentId((current) =>
                      current === entry.id ? null : current,
                    )
                  }
                  avatarUrl={userAvatarSrc(entry.actor?.avatarAssetId)}
                  author={
                    entry.actor
                      ? memberName(entry.actor)
                      : t("problems.unknownAuthor")
                  }
                  dateTime={entry.createdAt}
                  timestamp={new Date(entry.createdAt).toLocaleString(locale)}
                >
                  {entry.note}
                </CommentItem>
              ) : (
                <ActivityTimelineItem
                  key={entry.id}
                  icon={(() => {
                    const Icon = activityAppearance(entry).icon;
                    return <Icon />;
                  })()}
                  tone={activityAppearance(entry).tone}
                  title={
                    "label" in activityAppearance(entry)
                      ? t(
                          `problems.notifications.${entry.after?.status === "in_progress" ? "workStarted" : "workPaused"}`,
                        )
                      : t(`problems.events.${entry.type}`)
                  }
                  actor={entry.actor ? memberName(entry.actor) : undefined}
                  timestamp={new Date(entry.createdAt).toLocaleString(locale)}
                  dateTime={entry.createdAt}
                  detailsLabel={t("problems.viewChanges")}
                  details={
                    entry.note ||
                    (["title", "description"].some(
                      (key) =>
                        entry.before?.[key as "title" | "description"] !==
                          entry.after?.[key as "title" | "description"] &&
                        entry.after?.[key as "title" | "description"],
                    ) ? (
                      <div className="flex flex-col gap-2">
                        {["title", "description"].map((key) => {
                          const before =
                            entry.before?.[key as "title" | "description"];
                          const after =
                            entry.after?.[key as "title" | "description"];
                          return before !== after && after ? (
                            <p key={key}>
                              {before ? `${before} → ` : ""}
                              {after}
                            </p>
                          ) : null;
                        })}
                      </div>
                    ) : undefined)
                  }
                >
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
                  {entry.before?.difficulty !== entry.after?.difficulty &&
                  entry.after?.difficulty ? (
                    <p className="text-sm">
                      {t("problems.difficulty")}:{" "}
                      {t(`problems.${entry.after.difficulty}`)}
                    </p>
                  ) : null}
                  {entry.before?.severity !== entry.after?.severity &&
                  entry.after?.severity ? (
                    <p className="text-sm">
                      {t("problems.severity")}:{" "}
                      {t(`problems.${entry.after.severity}`)}
                    </p>
                  ) : null}
                  {(entry.after?.assignees !== undefined ||
                    entry.after?.assigneeId !== undefined) &&
                  JSON.stringify(
                    v1.problems
                      .problemAssignees(entry.before ?? {})
                      .map((member) => member.id)
                      .sort(),
                  ) !==
                    JSON.stringify(
                      v1.problems
                        .problemAssignees(entry.after ?? {})
                        .map((member) => member.id)
                        .sort(),
                    ) ? (
                    <p className="text-sm">
                      {t("problems.assignee")}:{" "}
                      {v1.problems
                        .problemAssignees(entry.after ?? {})
                        .map(memberName)
                        .join(", ") || t("problems.unassigned")}
                    </p>
                  ) : null}
                </ActivityTimelineItem>
              ),
            )}
        </ol>
      ) : null}
      {remote.data && remote.data.total > remote.data.pageSize ? (
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
    </>
  );
  const latest = latestPage?.items.find(
    (entry) => entry.type !== "PROBLEM_COMMENTED",
  );
  return kind === "activity" ? (
    <ActivityTimeline
      title={t("problems.activity")}
      count={remote.data?.total}
      summary={
        latest
          ? `${t(`problems.events.${latest.type}`)} · ${new Date(latest.createdAt).toLocaleString(locale)}`
          : undefined
      }
    >
      {content}
    </ActivityTimeline>
  ) : (
    <>
      <CommentThread title={t("problems.comments")} composer={composer}>
        {content}
      </CommentThread>
      {user?.isAdmin || user?.isSuperAdmin ? (
        <ProblemActivity
          kind="activity"
          problemId={problemId}
          revision={revision}
        />
      ) : null}
    </>
  );
}
