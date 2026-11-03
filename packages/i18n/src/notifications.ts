import { createFormatter } from "./format";
import type { MessageKey } from "./messages";

export interface NotificationMessageInput {
  type: string;
  actorName: string;
  subjectLabel: string;
  reason?: string;
  subjectType?: string;
  actorIsSystem?: boolean;
}

/** Shared by inbox, in-app alerts, and server-side push delivery. */
export function formatNotificationMessage(
  locale: string | null | undefined,
  event: NotificationMessageInput,
): { title: string; body: string } {
  const formatter = createFormatter(locale);
  const eventKey = `notifications.events.${event.type}` as MessageKey;
  const subjectKey =
    `notifications.subjects.${event.subjectType}` as MessageKey;
  return {
    title: formatter.format("notifications.pushTitle"),
    body:
      event.reason === "unassigned"
        ? formatter.format("notifications.assignmentRemoved")
        : formatter.format(
            formatter.has(eventKey) ? eventKey : "notifications.genericEvent",
            {
              actor:
                event.actorName ||
                formatter.format(
                  event.actorIsSystem
                    ? "notifications.system"
                    : "notifications.teamMember",
                ),
              subject:
                event.subjectLabel ||
                formatter.format(
                  formatter.has(subjectKey)
                    ? subjectKey
                    : "notifications.subjects.record",
                ),
            },
          ),
  };
}
