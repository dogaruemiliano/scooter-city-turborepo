"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, v1 } from "@repo/api-shared";
import { motion } from "@repo/theme";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { SaveButton } from "@repo/ui/components/save-button";
import { useRemote, useTask } from "@/components/WorkspaceForm";
import { webApi } from "@/lib/api";

export function useAssigneeReminders(
  problem: v1.problems.Problem,
  enabled: boolean,
) {
  const t = useTranslations("workspace.problems");
  const task = useTask();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const running = useRef(false);
  const load = useCallback(async () => {
    if (!enabled) return null;
    const status = await webApi.fetch(
      `/v1/problems/${encodeURIComponent(problem.id)}/reminders`,
      v1.problems.problemReminderStatusSchema,
      { cache: "no-store" },
    );
    const receivedAt = Date.now();
    const serverNow = Date.parse(status.serverNow);
    // Convert server deadlines to local elapsed time; no assumption about clock skew.
    setCooldowns(
      Object.fromEntries(
        status.items.map((item) => [
          item.assigneeId,
          item.nextAllowedAt
            ? receivedAt +
              Math.max(0, Date.parse(item.nextAllowedAt) - serverNow)
            : 0,
        ]),
      ),
    );
    setClock(receivedAt);
    setBlocked(false);
    return { ...status, revision: problem.revision };
  }, [enabled, problem.id, problem.revision]);
  const remote = useRemote(load);
  const reload = remote.reload;
  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(
      () => setClock(Date.now()),
      motion.duration.countdownTick,
    );
    const refresh = () => reload();
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [enabled, reload]);
  async function send(assigneeId: string) {
    if (
      running.current ||
      !enabled ||
      blocked ||
      remote.loading ||
      remote.error ||
      !remote.data ||
      (cooldowns[assigneeId] ?? 0) > Date.now()
    )
      return;
    running.current = true;
    setPendingId(assigneeId);
    setNotice("");
    await task.run(async () => {
      try {
        const result = await webApi.fetch(
          `/v1/problems/${encodeURIComponent(problem.id)}/reminders`,
          v1.problems.problemReminderResultSchema,
          {
            method: "POST",
            json: { revision: problem.revision, assigneeId },
          },
        );
        const now = Date.now();
        setCooldowns((current) => ({
          ...current,
          [assigneeId]:
            now +
            Math.max(
              0,
              Date.parse(result.nextAllowedAt) - Date.parse(result.serverNow),
            ),
        }));
        setClock(now);
        setNotice(t(result.sent ? "reminderSent" : "reminderAlreadySent"));
      } catch (cause) {
        if (
          !(cause instanceof ApiError) ||
          [401, 403, 404, 409].includes(cause.status)
        )
          setBlocked(true);
        throw cause;
      } finally {
        running.current = false;
        setPendingId(null);
      }
    });
  }
  return {
    pending: task.busy,
    pendingId,
    error: task.error || remote.error,
    notice,
    reload: remote.reload,
    disabled: blocked || remote.loading || !!remote.error || !remote.data,
    secondsRemaining: (id: string) =>
      Math.max(
        0,
        Math.ceil(
          ((cooldowns[id] ?? 0) - clock) / motion.duration.countdownTick,
        ),
      ),
    send,
  };
}

export function AssigneeReminderButton({
  name,
  pending,
  disabled,
  secondsRemaining,
  onClick,
}: {
  name: string;
  pending: boolean;
  disabled: boolean;
  secondsRemaining: number;
  onClick: () => void;
}) {
  const t = useTranslations("workspace.problems");
  const label = secondsRemaining
    ? t("reminderCooldown", { seconds: secondsRemaining, name })
    : t("sendReminder", { name });
  return (
    <SaveButton
      type="button"
      iconOnly
      variant="ghost"
      icon={<Bell aria-hidden="true" />}
      idleLabel={
        secondsRemaining ? t("reminderCooldownLabel", { name }) : label
      }
      pendingLabel={t("sendingReminder", { name })}
      successLabel={t("reminderSent")}
      state={pending ? "pending" : "idle"}
      disabled={disabled || secondsRemaining > 0}
      title={label}
      onClick={onClick}
    />
  );
}
