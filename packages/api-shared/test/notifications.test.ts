import assert from "node:assert/strict";
import test from "node:test";
import { v1 } from "../src";

test("notification query booleans preserve false and reject ambiguous values", () => {
  assert.equal(
    v1.notifications.listNotificationsQuerySchema.parse({ unreadOnly: "false" })
      .unreadOnly,
    false,
  );
  assert.equal(
    v1.notifications.listNotificationsQuerySchema.parse({ pending: "true" })
      .pending,
    true,
  );
  for (const input of [
    { unreadOnly: "yes" },
    { pending: "1" },
    { limit: 101 },
    { recipientId: "someone-else" },
  ]) {
    assert.equal(
      v1.notifications.listNotificationsQuerySchema.safeParse(input).success,
      false,
    );
  }
});

test("notification mutations cannot inject another recipient or unbounded receipts", () => {
  assert.equal(
    v1.notifications.presentNotificationsInputSchema.safeParse({
      ids: ["notification"],
      recipientId: "other",
    }).success,
    false,
  );
  assert.equal(
    v1.notifications.presentNotificationsInputSchema.safeParse({ ids: [] })
      .success,
    false,
  );
  assert.equal(
    v1.notifications.presentNotificationsInputSchema.safeParse({
      ids: Array.from({ length: 101 }, (_, i) => String(i)),
    }).success,
    false,
  );
  assert.equal(
    v1.notifications.markAllNotificationsReadInputSchema.safeParse({}).success,
    false,
  );
  assert.equal(
    v1.notifications.markAllNotificationsReadInputSchema.safeParse({
      cutoff: "2026-11-03T10:00:00.000Z",
    }).success,
    true,
  );
});

test("push subscriptions require secure endpoints, valid key encoding and a supported locale", () => {
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test",
    keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
    locale: "ro",
  };
  assert.equal(
    v1.notifications.registerPushSubscriptionInputSchema.safeParse(subscription)
      .success,
    true,
  );
  for (const invalid of [
    { ...subscription, endpoint: "http://localhost/callback" },
    { ...subscription, keys: { p256dh: "invalid", auth: "invalid" } },
    { ...subscription, locale: "de" },
    { ...subscription, userId: "other-account" },
  ]) {
    assert.equal(
      v1.notifications.registerPushSubscriptionInputSchema.safeParse(invalid)
        .success,
      false,
    );
  }
});

test("notification preferences cannot enable the future email channel", () => {
  assert.equal(
    v1.notifications.updateNotificationPreferencesInputSchema.safeParse({
      pushEnabled: true,
      mutedCategories: ["jobs"],
    }).success,
    true,
  );
  assert.equal(
    v1.notifications.updateNotificationPreferencesInputSchema.safeParse({
      pushEnabled: true,
      mutedCategories: [],
      emailEnabled: true,
    }).success,
    false,
  );
});

test("notification links stay local and scooter summaries carry brand-qualified identity", () => {
  const item = {
    id: "notification",
    eventId: "event",
    type: "issue.assigned",
    category: "jobs",
    actorName: "Maria",
    subjectType: "issue",
    subjectId: "issue",
    subjectLabel: "Brakes",
    targetPath: "/problems/issue",
    scooter: { id: "scooter", fleetNumber: 7, brandCode: "HON" },
    changes: ["assignees"],
    reason: "assigned",
    createdAt: "2026-11-03T10:00:00.000Z",
    readAt: null,
    presentedAt: null,
  };
  const parsed = v1.notifications.notificationSchema.parse(item);
  assert.equal(v1.scooters.scooterDisplayCode(parsed.scooter!), "007 HON");
  for (const targetPath of ["https://example.test", "//example.test"]) {
    assert.equal(
      v1.notifications.notificationSchema.safeParse({ ...item, targetPath })
        .success,
      false,
    );
  }
  assert.equal(
    v1.notifications.notificationSchema.safeParse({
      ...item,
      scooter: { id: "scooter", fleetNumber: 7 },
    }).success,
    false,
  );
});
