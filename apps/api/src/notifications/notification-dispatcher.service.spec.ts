import { ConflictException, ForbiddenException, Logger } from "@nestjs/common";
import type { AccessSnapshot } from "../access/access.resolver";
import type { AccessService } from "../access/access.service";
import type { PrismaService } from "../prisma/prisma.service";
import {
  NotificationDispatcherService,
  NOTIFICATION_LEASE_MS,
} from "./notification-dispatcher.service";
import type { NotificationPushService } from "./notification-push.service";
import { NotificationsService } from "./notifications.service";

const now = new Date("2026-11-03T12:00:00.000Z");
const snapshot: AccessSnapshot = {
  userId: "recipient",
  isSuperAdmin: true,
  isAdmin: false,
  effectiveScopes: {},
  accessRevision: 1,
  portalEligible: false,
  roleVersions: [],
};

function setup() {
  const delivery = {
    id: "delivery-1",
    notificationId: "notification-1",
    subscriptionId: "subscription-1",
    attempts: 0,
  };
  const row = {
    ...delivery,
    notification: {
      id: "notification-1",
      eventId: "event-1",
      recipientId: snapshot.userId,
      reason: "activity",
      createdAt: now,
      readAt: null,
      presentedAt: null,
      event: {
        id: "event-1",
        type: "scooter.updated",
        category: "scooters",
        actorName: "Maria",
        subjectType: "scooter",
        subjectId: "scooter-1",
        subjectLabel: "007 HON",
        targetPath: "/scooters/scooter-1",
        scooter: { id: "scooter-1", fleetNumber: 7, brandCode: "HON" },
        changes: ["model"],
      },
    },
    subscription: {
      id: "subscription-1",
      userId: snapshot.userId,
      sessionId: "session-1",
      revokedAt: null,
      locale: "en",
      endpoint: "https://fcm.googleapis.com/fcm/send/token",
      p256dh: "public-key",
      auth: "auth-key",
      session: { id: "session-1", userId: snapshot.userId, revokedAt: null },
    },
  };
  const db = {
    notificationEvent: { findMany: jest.fn().mockResolvedValue([]) },
    notificationPushSubscription: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    notificationDelivery: {
      findMany: jest.fn().mockResolvedValue([delivery]),
      findFirst: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    notification: {
      findFirst: jest.fn().mockResolvedValue({ id: "notification-1" }),
    },
    notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
    session: { count: jest.fn().mockResolvedValue(1) },
  };
  const access = { getSnapshot: jest.fn().mockResolvedValue(snapshot) };
  const push = {
    config: { configured: true, publicKey: "vapid-public-key" },
    send: jest.fn().mockResolvedValue(undefined),
  };
  const dispatcher = new NotificationDispatcherService(
    db as unknown as PrismaService,
    access as unknown as AccessService,
    push as unknown as NotificationPushService,
  );
  return { db, access, push, dispatcher };
}

describe("durable push worker failures", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now });
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("revokes an expired subscription and makes HTTP 410 terminal", async () => {
    const { db, push, dispatcher } = setup();
    push.send.mockRejectedValue({
      statusCode: 410,
      body: "PRIVATE PROVIDER CONTENT",
    });
    await dispatcher.runOnce();
    expect(db.notificationPushSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: "subscription-1" },
      data: { revokedAt: now },
    });
    expect(db.notificationDelivery.updateMany).toHaveBeenLastCalledWith({
      where: { id: "delivery-1", leaseId: expect.any(String) as unknown },
      data: expect.objectContaining({
        status: "failed",
        lastError: "PUSH_PROVIDER_410",
        leaseId: null,
        leaseUntil: null,
      }) as unknown,
    });
    expect(
      JSON.stringify(db.notificationDelivery.updateMany.mock.calls),
    ).not.toContain("PRIVATE PROVIDER CONTENT");
  });

  it("keeps rate-limited work durable with a future retry instead of revoking its destination", async () => {
    const { db, push, dispatcher } = setup();
    push.send.mockRejectedValue({ statusCode: 429 });
    await dispatcher.runOnce();
    const calls = db.notificationDelivery.updateMany.mock.calls as unknown as [
      {
        data: {
          status: string;
          lastError: string;
          availableAt: Date;
          leaseId: string | null;
        };
      },
    ][];
    const lastCall = calls.at(-1)?.[0];
    expect(lastCall?.data).toMatchObject({
      status: "pending",
      lastError: "PUSH_PROVIDER_429",
      leaseId: null,
    });
    expect(lastCall?.data.availableAt.getTime()).toBeGreaterThan(now.getTime());
    expect(db.notificationPushSubscription.updateMany).not.toHaveBeenCalledWith(
      {
        where: { id: "subscription-1" },
        data: expect.anything() as unknown,
      },
    );
  });

  it("does not send when another worker wins the conditional claim", async () => {
    const { db, push, dispatcher } = setup();
    db.notificationDelivery.updateMany.mockResolvedValueOnce({ count: 0 });
    await dispatcher.runOnce();
    expect(push.send).not.toHaveBeenCalled();
    expect(db.notificationDelivery.findFirst).not.toHaveBeenCalled();
    expect(db.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        AND: [
          expect.objectContaining({
            status: { in: ["pending", "sending"] },
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
          }) as unknown,
          { id: "delivery-1" },
        ],
      },
      data: expect.objectContaining({
        status: "sending",
        leaseId: expect.any(String) as unknown,
        leaseUntil: new Date(now.getTime() + NOTIFICATION_LEASE_MS),
        attempts: { increment: 1 },
      }) as unknown,
    });
  });
});

describe("manual retry boundaries", () => {
  it("rejects ordinary admins before issuing a retry mutation", async () => {
    const { db, access, push } = setup();
    access.getSnapshot.mockResolvedValue({
      ...snapshot,
      isSuperAdmin: false,
      isAdmin: true,
    });
    const service = new NotificationsService(
      db as unknown as PrismaService,
      access as unknown as AccessService,
      push as unknown as NotificationPushService,
    );
    await expect(
      service.retryDelivery(snapshot.userId, "delivery-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.notificationDelivery.updateMany).not.toHaveBeenCalled();
  });

  it("reports a conflict when a failed row is still owned by an active lease", async () => {
    const { db, access, push } = setup();
    db.notificationDelivery.updateMany.mockResolvedValue({ count: 0 });
    const service = new NotificationsService(
      db as unknown as PrismaService,
      access as unknown as AccessService,
      push as unknown as NotificationPushService,
    );
    await expect(
      service.retryDelivery(snapshot.userId, "delivery-1"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "delivery-1",
        AND: expect.arrayContaining([
          {
            OR: [
              { leaseUntil: null },
              { leaseUntil: { lt: expect.any(Date) as unknown } },
            ],
          },
        ]) as unknown,
      }) as unknown,
      data: expect.objectContaining({
        status: "pending",
        attempts: 0,
      }) as unknown,
    });
  });
});
