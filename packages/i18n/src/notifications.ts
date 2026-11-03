import { createFormatter, getMessageTemplate } from "./format";
import type { MessageKey } from "./messages";

export interface NotificationMessageInput {
  type: string;
  actorName: string;
  subjectLabel: string;
  reason?: string;
  subjectType?: string;
  actorIsSystem?: boolean;
}

export interface NotificationMessagePart {
  kind: "text" | "actor" | "subject";
  text: string;
}

/** Structured emphasis without parsing names out of an already rendered sentence. */
export function formatNotificationMessageParts(
  locale: string | null | undefined,
  event: NotificationMessageInput,
): NotificationMessagePart[] {
  const formatter = createFormatter(locale);
  if (event.reason === "unassigned")
    return [
      {
        kind: "text",
        text: formatter.format("notifications.assignmentRemoved"),
      },
    ];
  const eventKey = `notifications.events.${event.type}` as MessageKey;
  const subjectKey =
    `notifications.subjects.${event.subjectType}` as MessageKey;
  const template = getMessageTemplate(
    locale,
    formatter.has(eventKey) ? eventKey : "notifications.genericEvent",
  )!;
  const values = {
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
  };
  return template
    .split(/(\{actor\}|\{subject\})/)
    .filter(Boolean)
    .map((text) =>
      text === "{actor}"
        ? { kind: "actor", text: values.actor }
        : text === "{subject}"
          ? { kind: "subject", text: values.subject }
          : { kind: "text", text },
    );
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
