"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, v1 } from "@repo/api-shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  Button,
  Field,
  FieldLabel,
  FormActions,
  Textarea,
} from "@repo/ui/components";
import { SaveButton } from "@repo/ui/components/save-button";
import { useSession } from "@/components/auth/SessionProvider";
import { Feedback, useTask } from "@/components/WorkspaceForm";
import { useWorkspaceNotifications } from "@/components/WorkspaceNotifications";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import { useFormAction } from "@/lib/form/use-form-action";

/** The same request, validation and feedback for detail and list completion. */
export function ProblemCompletion({
  problem,
  onCompleted,
  onBusyChange,
  disabled = false,
  compact = false,
  open: controlledOpen,
  onOpenChange,
}: {
  problem: v1.problems.Problem;
  onCompleted: (problem: v1.problems.Problem) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("workspace");
  const shared = useTranslations("shared.actions");
  const formAction = useFormAction();
  const { user } = useSession();
  const router = useRouter();
  const notifications = useWorkspaceNotifications();
  const task = useTask();
  const [latest, setLatest] = useState<v1.problems.Problem | null>(null);
  const current =
    latest?.id === problem.id && latest.revision >= problem.revision
      ? latest
      : problem;
  const [notes, setNotes] = useState("");
  const [localOpen, setLocalOpen] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const pending = useRef(false);
  const optional = !!(user?.isAdmin || user?.isSuperAdmin);
  const own = v1.problems
    .problemAssignees(current)
    .some(({ id }) => id === user?.id);
  const permitted =
    canAccess(user, "problems.resolve", own ? "ASSIGNED" : "ALL") &&
    (optional || own);
  const active = current.status === "open" || current.status === "in_progress";
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean) => {
    if (pending.current) return;
    setLocalOpen(value);
    onOpenChange?.(value);
  };
  useEffect(() => {
    onBusyChange?.(task.busy);
    return () => onBusyChange?.(false);
  }, [task.busy, onBusyChange]);

  const form = (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (
          pending.current ||
          task.busy ||
          disabled ||
          needsReload ||
          !permitted ||
          !active ||
          (!optional && !notes.trim())
        )
          return;
        pending.current = true;
        void task.run(async () => {
          try {
            const updated = await webApi.fetch(
              `/v1/problems/${encodeURIComponent(current.id)}/resolve`,
              v1.problems.problemSchema,
              {
                method: "POST",
                json: {
                  revision: current.revision,
                  ...(notes.trim() ? { resolutionNotes: notes.trim() } : {}),
                },
              },
            );
            router.refresh();
            notifications?.add({
              title: t("problems.notifications.taskCompleted"),
              variant: "success",
            });
            onCompleted(updated);
            setLocalOpen(false);
            onOpenChange?.(false);
          } catch (cause) {
            // An ambiguous outcome or stale/forbidden record needs a fresh read before another write.
            if (
              !(cause instanceof ApiError) ||
              [401, 403, 404, 409].includes(cause.status)
            )
              setNeedsReload(true);
            throw cause;
          } finally {
            pending.current = false;
          }
        });
      }}
    >
      <Feedback error={task.error} />
      {needsReload ? (
        <Button
          type="button"
          variant="outline"
          disabled={task.busy}
          onClick={() => {
            void task.run(async () => {
              const latest = await webApi.fetch(
                `/v1/problems/${encodeURIComponent(current.id)}`,
                v1.problems.problemSchema,
                { cache: "no-store" },
              );
              setLatest(latest);
              setNeedsReload(false);
            });
          }}
        >
          {t("problems.reloadLatest")}
        </Button>
      ) : null}
      {!active || !permitted ? (
        <p role="status">{t("problems.completionUnavailable")}</p>
      ) : (
        <>
          <Field>
            <FieldLabel htmlFor={`resolution-${current.id}`}>
              {t(
                optional
                  ? "problems.optionalResolution"
                  : "problems.resolution",
              )}
            </FieldLabel>
            <Textarea
              id={`resolution-${current.id}`}
              placeholder={t(
                current.scooterId === null
                  ? "todos.resolutionPlaceholder"
                  : "problems.resolutionPlaceholder",
              )}
              required={!optional}
              maxLength={4000}
              disabled={task.busy}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <FormActions pending={task.busy}>
            <SaveButton
              type="submit"
              className="w-full"
              disabled={disabled || needsReload || (!optional && !notes.trim())}
              {...formAction("complete", {
                pending: task.busy,
                error: task.error,
              })}
            />
          </FormActions>
        </>
      )}
    </form>
  );
  if (!compact) return form;
  return (
    <>
      {controlledOpen === undefined ? (
        <Button
          className="sticky bottom-4 z-sticky order-last w-full shadow-primary"
          disabled={disabled || task.busy}
          onClick={() => setOpen(true)}
        >
          {t("problems.completeTask")}
        </Button>
      ) : null}
      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetContent>
          <BottomSheetHeader className="flex-row items-center justify-between gap-3">
            <BottomSheetTitle>{t("problems.completeTask")}</BottomSheetTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden shrink-0 lg:inline-flex"
              aria-label={shared("close")}
              disabled={task.busy}
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </BottomSheetHeader>
          <BottomSheetBody className="gap-6">
            <p className="text-sm font-medium">{current.title}</p>
            {form}
          </BottomSheetBody>
        </BottomSheetContent>
      </BottomSheet>
    </>
  );
}
