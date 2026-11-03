/** Opt-in PostgreSQL regressions; only an explicitly named disposable DB is accepted. */
import { randomBytes, randomUUID, createECDH } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import type { Logger } from "nestjs-pino";
import { NotFoundException } from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { AccessService } from "../src/access/access.service";
import { AuditService } from "../src/audit/audit.service";
import type { Env } from "../src/config/env";
import type { MailerService } from "../src/mailer/mailer.service";
import type { ImageStorageService } from "../src/image-storage/image-storage.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { publishNotificationEvent } from "../src/notifications/notification-events";
import { NotificationDispatcherService } from "../src/notifications/notification-dispatcher.service";
import { NotificationPushService } from "../src/notifications/notification-push.service";
import { NotificationsService } from "../src/notifications/notifications.service";
import { ProblemsService } from "../src/problems/problems.service";
import { ProblemPhotosService } from "../src/problems/problem-photos.service";

const databaseUrl = process.env.NOTIFICATIONS_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("Notifications against PostgreSQL", () => {
  let db: PrismaService;
  let inbox: NotificationsService;
  let dispatcher: NotificationDispatcherService;
  let problems: ProblemsService;
  const prefix = `notification-test-${randomUUID()}`;
  const actorId = `${prefix}-actor`;
  const observerId = `${prefix}-observer`;
  const mechanicA = `${prefix}-mechanic-a`;
  const mechanicB = `${prefix}-mechanic-b`;
  const restrictedId = `${prefix}-restricted`;
  const userIds = [actorId, observerId, mechanicA, mechanicB, restrictedId];
  const scooterId = `${prefix}-scooter`;
  const brandId = `${prefix}-brand`;
  const send = jest.fn().mockResolvedValue(undefined);
  const push = {
    config: { configured: true, publicKey: "test-key" },
    send,
  } as unknown as NotificationPushService;
  const query = v1.notifications.listNotificationsQuerySchema.parse({});

  async function publish(type = "scooter.updated") {
    await db.$transaction((tx) =>
      publishNotificationEvent(tx, {
        type,
        category: "scooters",
        actorId,
        subjectType: "scooter",
        subjectId: scooterId,
        scooterId,
        permissionKey: "scooters.read",
        targetPath: `/scooters/${scooterId}`,
        changes: ["model"],
      }),
    );
    return db.notificationEvent.findFirstOrThrow({
      where: { actorId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async function subscription(userId = observerId) {
    const session = await db.session.create({ data: { userId } });
    await db.refreshToken.create({
      data: {
        userId,
        sessionId: session.id,
        jti: randomUUID(),
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const ecdh = createECDH("prime256v1");
    const input = {
      endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
      keys: {
        p256dh: ecdh.generateKeys().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
      locale: "en" as const,
    };
    await inbox.registerSubscription(userId, session.id, input);
    return { session, input };
  }

  async function createIssue(assigneeIds = [mechanicA]) {
    return problems.create(
      actorId,
      v1.problems.createProblemInputSchema.parse({
        scooterId,
        title: "Check brakes",
        difficulty: "easy",
        assigneeIds,
      }),
    );
  }

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !url.pathname.startsWith("/scooter_notifications_test_")
    )
      throw new Error(
        "Use an explicitly named local disposable scooter_notifications_test_* database",
      );
    db = new PrismaService({
      DATABASE_URL: databaseUrl,
      NODE_ENV: "test",
    } as Env);
    await db.$connect();
    const audit = new AuditService(db, {
      error: () => undefined,
    } as unknown as Logger);
    const access = new AccessService(db, audit, {} as MailerService, {} as Env);
    inbox = new NotificationsService(db, access, push);
    dispatcher = new NotificationDispatcherService(db, access, push);
    problems = new ProblemsService(
      db,
      access,
      audit,
      new ProblemPhotosService(db, {} as ImageStorageService),
    );
    await db.user.createMany({
      data: userIds.map((id) => ({
        id,
        email: `${id}@example.test`,
        firstName: id === actorId ? "Maria" : "Test",
        loginStatus: "ACTIVE" as const,
        isSuperAdmin: id === actorId || id === observerId,
      })),
    });
    const mechanicRole = await db.role.findUniqueOrThrow({
      where: { slug: "mechanic" },
    });
    await db.userRole.createMany({
      data: [mechanicA, mechanicB].map((userId) => ({
        userId,
        roleId: mechanicRole.id,
      })),
    });
    await db.userPermissionOverride.createMany({
      data: [
        "notifications.receive",
        "notifications.activity.read",
        "scooters.read",
      ].map((permissionKey) => ({
        userId: restrictedId,
        permissionKey,
        scopes: ["ALL"],
      })),
    });
    await db.scooterBrand.create({
      data: { id: brandId, name: prefix, code: randomUUID().slice(0, 8) },
    });
    await db.scooter.create({
      data: {
        id: scooterId,
        brandId,
        fleetNumber: 1_800_000_000 + Math.floor(Math.random() * 100_000_000),
        vin: randomUUID().replaceAll("-", "").slice(0, 17),
        powertrainType: "electric",
      },
    });
  }, 30_000);

  beforeEach(async () => {
    send.mockReset().mockResolvedValue(undefined);
    await db.notificationEvent.deleteMany({
      where: { actorId: { in: userIds } },
    });
    await db.notificationPushSubscription.deleteMany({
      where: { userId: { in: userIds } },
    });
    await db.userPermissionOverride.updateMany({
      where: { userId: restrictedId, permissionKey: "scooters.read" },
      data: { scopes: ["ALL"] },
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.notificationEvent.deleteMany({
        where: { actorId: { in: userIds } },
      });
      await db.scooterProblemPhoto.deleteMany({
        where: { problem: { reporterId: actorId } },
      });
      await db.scooterProblem.deleteMany({ where: { reporterId: actorId } });
      await db.auditEvent.deleteMany({ where: { userId: { in: userIds } } });
      await db.scooter.deleteMany({ where: { id: scooterId } });
      await db.scooterBrand.deleteMany({ where: { id: brandId } });
      await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await db.userPermissionOverride.deleteMany({
        where: { userId: { in: userIds } },
      });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await db.$disconnect();
    }
  });

  it("rolls back the business write and event together", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await tx.scooter.update({
          where: { id: scooterId },
          data: { model: "Must roll back" },
        });
        await publishNotificationEvent(tx, {
          type: "scooter.updated",
          category: "scooters",
          actorId,
          subjectType: "scooter",
          subjectId: scooterId,
          scooterId,
          permissionKey: "scooters.read",
        });
        throw new Error("ROLLBACK_TEST");
      }),
    ).rejects.toThrow("ROLLBACK_TEST");
    expect(
      (await db.scooter.findUniqueOrThrow({ where: { id: scooterId } })).model,
    ).toBeNull();
    expect(await db.notificationEvent.count({ where: { actorId } })).toBe(0);
  });

  it("deduplicates concurrent dispatch and replay, excludes the actor, and retains own activity", async () => {
    const event = await publish();
    await Promise.all([dispatcher.runOnce(), dispatcher.runOnce()]);
    await db.notificationEvent.update({
      where: { id: event.id },
      data: { processedAt: null },
    });
    await dispatcher.runOnce();
    expect(
      await db.notification.count({
        where: { eventId: event.id, recipientId: observerId },
      }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: { eventId: event.id, recipientId: actorId },
      }),
    ).toBe(0);
    expect(
      (await inbox.activity(actorId, query)).items.map((item) => item.eventId),
    ).toContain(event.id);
    expect((await inbox.list(actorId, query)).unreadCount).toBe(0);
  });

  it("captures every assignee at creation and keeps TODOs away from mechanics", async () => {
    const issue = await createIssue([mechanicA, mechanicB]);
    await problems.create(
      actorId,
      v1.problems.createProblemInputSchema.parse({
        scooterId: null,
        title: "Admin TODO",
      }),
    );
    await dispatcher.runOnce();
    for (const userId of [mechanicA, mechanicB]) {
      const list = await inbox.list(userId, query);
      expect(list.items).toHaveLength(1);
      expect(list.items[0]).toMatchObject({
        subjectId: issue.id,
        subjectType: "issue",
        reason: "assigned",
      });
      expect(list.items[0]?.scooter?.brandCode).toBeTruthy();
    }
  });

  it("does not send an earlier comment to a later assignee and hides details after removal", async () => {
    const issue = await createIssue();
    await db.notificationEvent.deleteMany({ where: { actorId } });
    await problems.comment(actorId, issue.id, {
      revision: issue.revision,
      body: "Please check the front brake",
    });
    const event = await db.notificationEvent.findFirstOrThrow({
      where: { actorId, type: "issue.commented" },
    });
    expect(event.assignedRecipientIds).toContain(mechanicA);
    expect(event.assignedRecipientIds).not.toContain(mechanicB);
    await db.scooterProblem.update({
      where: { id: issue.id },
      data: { assigneeId: mechanicB, assignees: { set: [{ id: mechanicB }] } },
    });
    await dispatcher.runOnce();
    expect((await inbox.list(mechanicA, query)).items).toHaveLength(0);
    expect((await inbox.list(mechanicB, query)).items).toHaveLength(0);
    expect((await inbox.list(observerId, query)).items[0]?.type).toBe(
      "issue.commented",
    );
  });

  it("applies revoked source access before list, count, direct lookup and activity pagination", async () => {
    await publish();
    await dispatcher.runOnce();
    const before = await inbox.list(restrictedId, query);
    expect(before.unreadCount).toBe(1);
    await db.userPermissionOverride.update({
      where: {
        userId_permissionKey: {
          userId: restrictedId,
          permissionKey: "scooters.read",
        },
      },
      data: { scopes: [] },
    });
    const after = await inbox.list(restrictedId, query);
    expect(after.items).toHaveLength(0);
    expect(after.unreadCount).toBe(0);
    await expect(
      inbox.detail(restrictedId, before.items[0].id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (await inbox.activity(restrictedId, { ...query, limit: 1 })).items,
    ).toHaveLength(0);
  });

  it("publishes work/checklist changes once and ignores no-op job saves", async () => {
    const issue = await createIssue();
    await db.notificationEvent.deleteMany({ where: { actorId } });
    const unchanged = await problems.update(
      actorId,
      issue.id,
      v1.problems.updateProblemInputSchema.parse({
        revision: issue.revision,
        title: issue.title,
      }),
    );
    expect(await db.notificationEvent.count({ where: { actorId } })).toBe(0);
    const started = await problems.update(
      actorId,
      issue.id,
      v1.problems.updateProblemInputSchema.parse({
        revision: unchanged.revision,
        startWork: true,
        checklist: [{ id: "brakes", text: "Test brakes", completed: true }],
      }),
    );
    await problems.resolve(actorId, issue.id, {
      revision: started.revision,
      resolutionNotes: "Brakes repaired",
    });
    await dispatcher.runOnce();
    const items = (await inbox.list(mechanicA, query)).items;
    expect(items.map((item) => item.type).sort()).toEqual([
      "issue.resolved",
      "issue.started",
    ]);
    expect(
      items.find((item) => item.type === "issue.started")?.changes,
    ).toContain("checklist");
  });

  it("gives removed assignees only a generic removal notice", async () => {
    const issue = await createIssue();
    await db.notificationEvent.deleteMany({ where: { actorId } });
    await problems.assign(actorId, issue.id, {
      revision: issue.revision,
      assigneeIds: [mechanicB],
    });
    await dispatcher.runOnce();
    const removed = (await inbox.list(mechanicA, query)).items;
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({
      reason: "unassigned",
      actorName: "",
      subjectId: "",
      subjectLabel: "",
      targetPath: null,
      scooter: null,
      changes: [],
    });
    expect((await inbox.list(mechanicB, query)).items[0]?.reason).toBe(
      "assigned",
    );
  });

  it("notifies other assignees about a mechanic comment without notifying its author", async () => {
    const issue = await createIssue([mechanicA, mechanicB]);
    await db.notificationEvent.deleteMany({ where: { actorId } });
    await problems.comment(mechanicA, issue.id, {
      revision: issue.revision,
      body: "Front brake checked",
    });
    await dispatcher.runOnce();
    expect((await inbox.list(mechanicA, query)).unreadCount).toBe(0);
    expect((await inbox.list(mechanicB, query)).items[0]?.type).toBe(
      "issue.commented",
    );
  });

  it("cancels all pending device pushes after actual presentation without marking read", async () => {
    await subscription();
    await subscription();
    await publish();
    await dispatcher.runOnce();
    const notification = (await inbox.list(observerId, query)).items[0];
    expect(
      await db.notificationDelivery.count({
        where: { notificationId: notification.id, status: "pending" },
      }),
    ).toBe(2);
    await inbox.presented(mechanicB, [notification.id]);
    expect(
      (
        await db.notification.findUniqueOrThrow({
          where: { id: notification.id },
        })
      ).presentedAt,
    ).toBeNull();
    await inbox.presented(observerId, [notification.id]);
    const row = await db.notification.findUniqueOrThrow({
      where: { id: notification.id },
    });
    expect(row.presentedAt).toBeInstanceOf(Date);
    expect(row.readAt).toBeNull();
    expect(
      await db.notificationDelivery.count({
        where: { notificationId: notification.id, status: "cancelled" },
      }),
    ).toBe(2);
    expect(send).not.toHaveBeenCalled();
  });

  it("falls back to push without a presentation receipt and never treats acceptance as read", async () => {
    await subscription();
    await publish();
    await dispatcher.runOnce();
    expect(send).not.toHaveBeenCalled();
    await db.notificationDelivery.updateMany({
      where: { status: "pending" },
      data: { availableAt: new Date(Date.now() - 1_000) },
    });
    await Promise.all([dispatcher.runOnce(), dispatcher.runOnce()]);
    expect(send).toHaveBeenCalledTimes(1);
    const row = await db.notification.findFirstOrThrow({
      where: { recipientId: observerId },
    });
    expect(row.readAt).toBeNull();
    expect(row.presentedAt).toBeNull();
    expect(
      await db.notificationDelivery.count({
        where: { notificationId: row.id, status: "accepted" },
      }),
    ).toBe(1);
  });

  it("does not push after session revocation", async () => {
    const { session } = await subscription();
    await publish();
    await dispatcher.runOnce();
    await db.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    await db.notificationDelivery.updateMany({
      where: { status: "pending" },
      data: { availableAt: new Date(Date.now() - 1_000) },
    });
    await dispatcher.runOnce();
    expect(send).not.toHaveBeenCalled();
    expect(
      await db.notificationPushSubscription.count({
        where: { sessionId: session.id, revokedAt: null },
      }),
    ).toBe(0);
  });

  it("reclaims a crashed push worker's expired sending lease", async () => {
    await subscription();
    await publish();
    await dispatcher.runOnce();
    await db.notificationDelivery.updateMany({
      where: { status: "pending" },
      data: {
        status: "sending",
        leaseId: "abandoned-worker",
        leaseUntil: new Date(Date.now() - 2_000),
        availableAt: new Date(Date.now() - 1_000),
        attempts: 1,
      },
    });
    await Promise.all([dispatcher.runOnce(), dispatcher.runOnce()]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await db.notificationDelivery.count({
        where: { status: "accepted", attempts: 2, leaseId: null },
      }),
    ).toBe(1);
  });

  it("keeps later notifications unread when marking a reviewed cutoff", async () => {
    const earlier = await publish();
    await dispatcher.runOnce();
    const list = await inbox.list(observerId, query);
    const cutoff = new Date(list.cutoff);
    const later = await publish("scooter.photos.changed");
    await dispatcher.runOnce();
    await db.notification.updateMany({
      where: { eventId: earlier.id },
      data: { createdAt: new Date(cutoff.getTime() - 1_000) },
    });
    await db.notification.updateMany({
      where: { eventId: later.id },
      data: { createdAt: new Date(cutoff.getTime() + 1_000) },
    });
    await inbox.markAllRead(observerId, list.cutoff);
    expect(
      (
        await db.notification.findFirstOrThrow({
          where: { recipientId: observerId, eventId: earlier.id },
        })
      ).readAt,
    ).toBeInstanceOf(Date);
    expect(
      (
        await db.notification.findFirstOrThrow({
          where: { recipientId: observerId, eventId: later.id },
        })
      ).readAt,
    ).toBeNull();
  });

  it("upgrades role defaults while preserving source grants and explicit user denials", async () => {
    const client = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5_000,
    });
    await client.connect();
    try {
      await client.query("BEGIN");
      const schema = `notifications_rehearsal_${randomUUID().replaceAll("-", "")}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}", public`);
      for (const table of [
        "User",
        "Session",
        "ScooterProblem",
        "Role",
        "RolePermission",
        "UserRole",
        "UserPermissionOverride",
        "AuditEvent",
      ])
        await client.query(
          `CREATE TABLE "${table}" (LIKE public."${table}" INCLUDING ALL)`,
        );
      await client.query(
        `INSERT INTO "Role" (id,slug,name,"updatedAt") VALUES ('admin-role','admin','Admin',CURRENT_TIMESTAMP),('mechanic-role','mechanic','Mechanic',CURRENT_TIMESTAMP),('custom-role','custom','Custom',CURRENT_TIMESTAMP)`,
      );
      await client.query(
        `INSERT INTO "User" (id,email,"updatedAt") VALUES ('user','notification-migration@example.test',CURRENT_TIMESTAMP)`,
      );
      await client.query(
        `INSERT INTO "UserRole" ("userId","roleId") VALUES ('user','admin-role')`,
      );
      await client.query(
        `INSERT INTO "UserPermissionOverride" ("userId","permissionKey",scopes,"updatedAt") VALUES ('user','notifications.receive',ARRAY[]::"PermissionScope"[],CURRENT_TIMESTAMP)`,
      );
      await client.query(
        `INSERT INTO "RolePermission" ("roleId","permissionKey",scopes) VALUES ('admin-role','persons.read',ARRAY['ALL']::"PermissionScope"[])`,
      );
      const migration = readFileSync(
        path.join(
          __dirname,
          "../prisma/migrations/20261103120000_notifications/migration.sql",
        ),
        "utf8",
      )
        .replace(/^BEGIN;\s*/, "")
        .replace(/COMMIT;\s*$/, "");
      await client.query(migration);
      expect(
        (
          await client.query(
            `SELECT "roleId","permissionKey",scopes::text AS scopes FROM "RolePermission" ORDER BY "roleId","permissionKey"`,
          )
        ).rows,
      ).toEqual([
        {
          roleId: "admin-role",
          permissionKey: "notifications.activity.read",
          scopes: "{ALL}",
        },
        {
          roleId: "admin-role",
          permissionKey: "notifications.receive",
          scopes: "{ALL}",
        },
        {
          roleId: "admin-role",
          permissionKey: "persons.read",
          scopes: "{ALL}",
        },
        {
          roleId: "mechanic-role",
          permissionKey: "notifications.receive",
          scopes: "{ASSIGNED}",
        },
      ]);
      expect(
        (
          await client.query<{ scopes: string }>(
            `SELECT scopes::text AS scopes FROM "UserPermissionOverride" WHERE "userId"='user'`,
          )
        ).rows[0]?.scopes,
      ).toBe("{}");
      expect(
        (
          await client.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM "NotificationEvent"`,
          )
        ).rows[0]?.count,
      ).toBe(0);
      const revision = (
        await client.query<{ accessRevision: number }>(
          `SELECT "accessRevision" FROM "User" WHERE id='user'`,
        )
      ).rows[0]?.accessRevision;
      await client.query(
        migration.slice(migration.indexOf("SELECT pg_advisory_xact_lock")),
      );
      expect(
        (
          await client.query<{ accessRevision: number }>(
            `SELECT "accessRevision" FROM "User" WHERE id='user'`,
          )
        ).rows[0]?.accessRevision,
      ).toBe(revision);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
