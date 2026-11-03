import { v1 } from "@repo/api-shared";
import type {
  Notification,
  NotificationEvent,
} from "../generated/prisma/client";

export function projectNotification(
  event: NotificationEvent,
  notification?: Notification,
  targetAvailable = true,
): v1.notifications.Notification {
  const removed = notification?.reason === "unassigned";
  const scooter = v1.notifications.notificationScooterSchema.safeParse(
    event.scooter,
  );
  return v1.notifications.notificationSchema.parse({
    id: notification?.id ?? event.id,
    eventId: event.id,
    type: removed ? "issue.unassigned" : event.type,
    category: event.category,
    actorName: removed ? "" : event.actorName,
    actorIsSystem: !event.actorId,
    subjectType: removed ? "issue" : event.subjectType,
    subjectId: removed ? "" : event.subjectId,
    subjectLabel: removed ? "" : event.subjectLabel,
    targetPath:
      !removed &&
      targetAvailable &&
      event.targetPath?.startsWith("/") &&
      !event.targetPath.startsWith("//") &&
      !event.targetPath.includes("\\") &&
      !Array.from(event.targetPath).some(
        (character) => character.charCodeAt(0) < 32,
      )
        ? event.targetPath
        : null,
    scooter: !removed && scooter.success ? scooter.data : null,
    changes: removed ? [] : event.changes,
    reason: notification?.reason ?? "activity",
    createdAt: (notification?.createdAt ?? event.createdAt).toISOString(),
    readAt: notification?.readAt?.toISOString() ?? null,
    presentedAt: notification?.presentedAt?.toISOString() ?? null,
  });
}

export function notificationCursor(row: { id: string; createdAt: Date }) {
  return Buffer.from(
    JSON.stringify([row.createdAt.toISOString(), row.id]),
  ).toString("base64url");
}

export function parseNotificationCursor(value: string): {
  id: string;
  createdAt: Date;
} | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string" ||
      !parsed[1] ||
      parsed[1].length > 200 ||
      !/^\d{4}-\d{2}-\d{2}T/.test(parsed[0])
    )
      return null;
    const createdAt = new Date(parsed[0]);
    return Number.isFinite(createdAt.getTime()) &&
      createdAt.toISOString() === parsed[0]
      ? { createdAt, id: parsed[1] }
      : null;
  } catch {
    return null;
  }
}
