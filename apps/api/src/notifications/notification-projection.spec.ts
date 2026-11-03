import type {
  Notification,
  NotificationEvent,
} from "../generated/prisma/client";
import {
  notificationCursor,
  parseNotificationCursor,
  projectNotification,
} from "./notification-projection";

const now = new Date("2026-11-03T12:00:00.000Z");
const event: NotificationEvent = {
  id: "event-1",
  type: "issue.updated",
  version: 1,
  category: "jobs",
  actorId: "admin-1",
  actorName: "Maria",
  subjectType: "issue",
  subjectId: "issue-1",
  subjectLabel: "Replace brake pads",
  permissionKey: "problems.read",
  targetPath: "/problems/issue-1",
  scooter: {
    id: "scooter-1",
    fleetNumber: 7,
    brandCode: "HON",
    vin: "PRIVATE",
  },
  problemId: "issue-1",
  changes: ["location", "checklist"],
  adminRecipientIds: ["admin-2"],
  assignedRecipientIds: ["mechanic-1"],
  removedRecipientIds: [],
  createdAt: now,
  processedAt: null,
  attempts: 0,
  availableAt: now,
  leaseId: null,
  leaseUntil: null,
  lastError: null,
};
const notification: Notification = {
  id: "notification-1",
  eventId: event.id,
  recipientId: "mechanic-1",
  reason: "assigned",
  createdAt: now,
  readAt: null,
  presentedAt: now,
};

describe("notification public projection", () => {
  it("returns only the display contract and keeps presentation distinct from reading", () => {
    const result = projectNotification(event, notification);
    expect(result.scooter).toEqual({
      id: "scooter-1",
      fleetNumber: 7,
      brandCode: "HON",
    });
    expect(result).not.toHaveProperty("permissionKey");
    expect(result).not.toHaveProperty("assignedRecipientIds");
    expect(result).not.toHaveProperty("actorId");
    expect(result.readAt).toBeNull();
    expect(result.presentedAt).toBe(now.toISOString());
  });

  it("removes confidential subject, actor, scooter and change data from unassignment notices", () => {
    const result = projectNotification(event, {
      ...notification,
      reason: "unassigned",
    });
    expect(result).toMatchObject({
      type: "issue.unassigned",
      actorName: "",
      subjectId: "",
      subjectLabel: "",
      targetPath: null,
      scooter: null,
      changes: [],
      reason: "unassigned",
    });
    expect(JSON.stringify(result)).not.toContain("Replace brake pads");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it.each([
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "/\u0000hidden",
  ])("does not project an unsafe navigation path %s", (targetPath) => {
    expect(
      projectNotification({ ...event, targetPath }, notification).targetPath,
    ).toBeNull();
  });

  it("turns deleted targets into a readable summary without a broken deep link", () => {
    const result = projectNotification(event, notification, false);
    expect(result.subjectLabel).toBe("Replace brake pads");
    expect(result.targetPath).toBeNull();
  });
});

describe("notification cursor boundary", () => {
  it("preserves the timestamp and ID needed to page rows sharing a timestamp", () => {
    const rows = ["a", "b"].map((id) => ({ id, createdAt: now }));
    expect(
      rows.map((row) => parseNotificationCursor(notificationCursor(row))),
    ).toEqual(rows);
    expect(notificationCursor(rows[0])).not.toBe(notificationCursor(rows[1]));
  });

  it.each([
    "not-base64!",
    Buffer.from('{"createdAt":"2026-11-03"}').toString("base64url"),
    Buffer.from('["invalid date","id"]').toString("base64url"),
    Buffer.from('["2026-02-31T12:00:00.000Z","id"]').toString("base64url"),
    Buffer.from('["2026-11-03T12:00:00.000Z",""]').toString("base64url"),
  ])("rejects malformed cursor %s", (cursor) => {
    expect(parseNotificationCursor(cursor)).toBeNull();
  });
});
