import type { Prisma } from "../generated/prisma/client";
import {
  publishAuditedNotification,
  publishNotificationEvent,
} from "./notification-events";
import { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { Logger } from "nestjs-pino";
import { AuditEventType } from "../audit/audit.types";

const user = (id: string, scopes: "ALL" | "ASSIGNED" = "ALL") => ({
  id,
  firstName: id,
  lastName: "Staff",
  isSuperAdmin: false,
  accessRevision: 1,
  roleMemberships: [
    {
      role: {
        id: `${id}-role`,
        slug: scopes === "ALL" ? "admin" : "mechanic",
        revision: 1,
        archivedAt: null,
        permissions: [
          { permissionKey: "notifications.receive", scopes: [scopes] },
          { permissionKey: "problems.read", scopes: [scopes] },
          ...(scopes === "ALL"
            ? [
                { permissionKey: "persons.read", scopes: ["ALL"] },
                { permissionKey: "person_documents.read", scopes: ["ALL"] },
                { permissionKey: "scooters.read", scopes: ["ALL"] },
                { permissionKey: "users.read", scopes: ["ALL"] },
                { permissionKey: "roles.read", scopes: ["ALL"] },
              ]
            : []),
        ],
      },
    },
  ],
  permissionOverrides: [],
});

function fixture() {
  const db = {
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          user("actor"),
          user("admin"),
          user("mechanic", "ASSIGNED"),
          user("removed", "ASSIGNED"),
        ]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    scooter: {
      findUnique: jest.fn().mockResolvedValue({
        id: "scooter",
        fleetNumber: 7,
        brand: { code: "HON" },
      }),
    },
    scooterProblem: {
      findUnique: jest.fn().mockResolvedValue({
        id: "job",
        title: "Repair brakes",
        scooterId: "scooter",
        assigneeId: "mechanic",
        assignees: [{ id: "mechanic" }],
      }),
    },
    person: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ firstName: "Ana", lastName: "Pop" }),
    },
    role: { findUnique: jest.fn().mockResolvedValue({ name: "Mechanic" }) },
    documentPackage: {
      findUnique: jest.fn().mockResolvedValue({ rentalId: "rental" }),
    },
    notificationEvent: {
      create: jest
        .fn<
          Promise<{ id: string }>,
          [{ data: Prisma.NotificationEventUncheckedCreateInput }]
        >()
        .mockResolvedValue({ id: "event" }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: "audit" }) },
  };
  return { db, tx: db as unknown as Prisma.TransactionClient };
}

describe("transactional notification events", () => {
  it("captures all eligible assignees and excludes the actor, deduplicating audience within each route", async () => {
    const { db, tx } = fixture();
    await publishNotificationEvent(tx, {
      type: "issue.updated",
      category: "jobs",
      actorId: "actor",
      subjectType: "issue",
      subjectId: "job",
      problemId: "job",
      subjectLabel: "Repair brakes",
      permissionKey: "problems.read",
      scooterId: "scooter",
      assignedIds: ["mechanic", "mechanic", "actor"],
      removedIds: ["removed"],
    });
    expect(db.notificationEvent.create.mock.calls[0][0].data).toMatchObject({
      adminRecipientIds: ["admin"],
      assignedRecipientIds: ["mechanic"],
      removedRecipientIds: ["removed"],
      actorName: "actor Staff",
      scooter: { id: "scooter", fleetNumber: 7, brandCode: "HON" },
    });
  });

  it("does not include mechanics in admin-only TODO activity", async () => {
    const { db, tx } = fixture();
    await publishNotificationEvent(tx, {
      type: "todo.created",
      category: "jobs",
      actorId: "actor",
      subjectType: "todo",
      subjectId: "todo",
      permissionKey: "problems.read",
      assignedIds: ["mechanic"],
    });
    expect(db.notificationEvent.create.mock.calls[0][0].data).toMatchObject({
      adminRecipientIds: ["admin"],
      assignedRecipientIds: [],
      removedRecipientIds: [],
    });
  });

  it("honors explicit source-permission denial even for an admin audience", async () => {
    const { db, tx } = fixture();
    const restricted = {
      ...user("admin"),
      permissionOverrides: [{ permissionKey: "problems.read", scopes: [] }],
    };
    db.user.findMany.mockResolvedValue([restricted]);
    await publishNotificationEvent(tx, {
      type: "issue.updated",
      category: "jobs",
      subjectType: "issue",
      subjectId: "job",
      permissionKey: "problems.read",
      assignedIds: ["admin"],
    });
    expect(db.notificationEvent.create.mock.calls[0][0].data).toMatchObject({
      adminRecipientIds: [],
      assignedRecipientIds: [],
    });
  });

  it("keeps the actor's business event even with no other recipients", async () => {
    const { db, tx } = fixture();
    db.user.findMany.mockResolvedValue([user("actor")]);
    await publishNotificationEvent(tx, {
      type: "scooter.created",
      category: "scooters",
      actorId: "actor",
      subjectType: "scooter",
      subjectId: "scooter",
      scooterId: "scooter",
      permissionKey: "scooters.read",
    });
    expect(db.notificationEvent.create.mock.calls[0][0].data).toMatchObject({
      subjectLabel: "007 HON",
      adminRecipientIds: [],
      assignedRecipientIds: [],
    });
  });

  it("propagates durable event write failures to the originating transaction", async () => {
    const { db, tx } = fixture();
    db.notificationEvent.create.mockRejectedValue(
      new Error("database unavailable"),
    );
    await expect(
      publishNotificationEvent(tx, {
        type: "issue.updated",
        category: "jobs",
        subjectType: "issue",
        subjectId: "job",
        permissionKey: "problems.read",
      }),
    ).rejects.toThrow("database unavailable");
  });

  it("maps a work transition and captures removed assignees from the original mutation", async () => {
    const { db, tx } = fixture();
    await publishAuditedNotification(
      tx,
      {
        type: AuditEventType.PROBLEM_UPDATED,
        userId: "actor",
        targetId: "job",
        meta: {
          before: { status: "open", assigneeId: "removed" },
          after: { status: "in_progress", assigneeId: "mechanic" },
        },
      },
      "audit-id",
    );
    expect(db.notificationEvent.create.mock.calls[0][0].data).toMatchObject({
      id: "audit-id",
      type: "issue.started",
      changes: ["status", "assignees"],
      assignedRecipientIds: ["mechanic"],
      removedRecipientIds: ["removed"],
    });
  });

  it("notifies a photo-only job edit and skips revision-only saves", async () => {
    const { db, tx } = fixture();
    await publishAuditedNotification(
      tx,
      {
        type: AuditEventType.PROBLEM_UPDATED,
        targetId: "job",
        meta: {
          before: { revision: 1, photos: [] },
          after: { revision: 2, photos: ["photo"] },
        },
      },
      "photo-edit",
    );
    expect(db.notificationEvent.create.mock.calls[0][0].data).toMatchObject({
      changes: ["photos"],
    });
    db.notificationEvent.create.mockClear();
    await publishAuditedNotification(
      tx,
      {
        type: AuditEventType.PROBLEM_UPDATED,
        targetId: "job",
        meta: { before: { revision: 2 }, after: { revision: 3 } },
      },
      "noop",
    );
    expect(db.notificationEvent.create).not.toHaveBeenCalled();
  });

  it("uses only safe person display data, without copying sensitive audit values", async () => {
    const { db, tx } = fixture();
    await publishAuditedNotification(
      tx,
      {
        type: AuditEventType.PERSON_DOCUMENT_UPDATED,
        userId: "actor",
        targetId: "person",
        meta: {
          actor: { email: "private@example.test" },
          changes: [
            { field: "cnp", before: "secret-old", after: "secret-new" },
          ],
        },
      },
      "person-change",
    );
    const data = db.notificationEvent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      subjectLabel: "Ana Pop",
      changes: ["cnp"],
      permissionKey: "person_documents.read",
    });
    expect(JSON.stringify(data)).not.toMatch(/secret-|private@example/);
  });

  it("never derives notification events from best-effort or read/security audits", async () => {
    const { db, tx } = fixture();
    const audit = new AuditService(
      db as unknown as PrismaService,
      { error: jest.fn() } as unknown as Logger,
    );
    await audit.record({
      type: AuditEventType.PROBLEM_COMMENTED,
      targetId: "job",
    });
    await publishAuditedNotification(
      tx,
      { type: AuditEventType.CONTRACT_DOCUMENT_ACCESSED, targetId: "file" },
      "read",
    );
    expect(db.auditEvent.create).toHaveBeenCalled();
    expect(db.notificationEvent.create).not.toHaveBeenCalled();
  });

  it("recognizes a Prisma transaction proxy even when its has trap reports deny-listed methods", async () => {
    const { db } = fixture();
    const transaction = new Proxy(
      { ...db, $transaction: jest.fn() },
      {
        has: () => true,
      },
    ) as unknown as Prisma.TransactionClient;
    const audit = new AuditService(
      db as unknown as PrismaService,
      { error: jest.fn() } as unknown as Logger,
    );
    await audit.recordRequired(transaction, {
      type: AuditEventType.PROBLEM_COMMENTED,
      userId: "actor",
      targetId: "job",
      targetType: "ScooterProblem",
      meta: { note: "Private conversation" },
    });
    expect(db.notificationEvent.create.mock.calls[0][0].data).toMatchObject({
      id: "audit",
      type: "issue.commented",
      assignedRecipientIds: ["mechanic"],
    });
  });

  it("distinguishes role assignment changes from unchanged access DTO bookkeeping", async () => {
    const { db, tx } = fixture();
    const before = {
      id: "staff",
      email: "private@example.test",
      roles: [{ id: "role-1", name: "Mechanic" }],
      overrides: [],
      accessRevision: 4,
    };
    await publishAuditedNotification(
      tx,
      {
        type: AuditEventType.ACCESS_USER_CHANGED,
        targetId: "staff",
        meta: {
          before,
          after: {
            expectedRevision: 4,
            roles: [{ id: "role-1", revision: 2 }],
            overrides: [],
          },
        },
      },
      "no-change",
    );
    expect(db.notificationEvent.create).not.toHaveBeenCalled();
    await publishAuditedNotification(
      tx,
      {
        type: AuditEventType.ACCESS_USER_CHANGED,
        targetId: "staff",
        meta: {
          before,
          after: {
            expectedRevision: 4,
            roles: [{ id: "role-2", revision: 1 }],
            overrides: [],
          },
        },
      },
      "role-change",
    );
    const data = db.notificationEvent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      type: "user.role.changed",
      changes: ["roles"],
    });
    expect(JSON.stringify(data)).not.toContain("private@example.test");
  });

  it("ignores unchanged shared-role metadata and order-only permission edits", async () => {
    const { db, tx } = fixture();
    const permissions = [
      { permissionKey: "problems.read", scopes: ["ASSIGNED", "AVAILABLE"] },
    ];
    await publishAuditedNotification(
      tx,
      {
        type: AuditEventType.ACCESS_ROLE_CHANGED,
        targetId: "role",
        meta: {
          before: {
            id: "role",
            name: "Mechanic",
            description: "Work",
            revision: 1,
            permissions,
          },
          after: {
            expectedRevision: 1,
            name: "Mechanic",
            description: "Work",
            permissions: [
              {
                permissionKey: "problems.read",
                scopes: ["AVAILABLE", "ASSIGNED"],
              },
            ],
          },
        },
      },
      "same-role",
    );
    expect(db.notificationEvent.create).not.toHaveBeenCalled();
  });

  it("emits successful contract actions with source-specific access, excluding OTP and downloads", async () => {
    const { db, tx } = fixture();
    for (const action of [
      "otp.rejected",
      "document.downloaded",
      "identity.selfie_accessed",
    ])
      await publishAuditedNotification(
        tx,
        {
          type: AuditEventType.CONTRACT_PACKAGE_CHANGED,
          targetId: "package",
          meta: { action },
        },
        action,
      );
    expect(db.notificationEvent.create).not.toHaveBeenCalled();
    await publishAuditedNotification(
      tx,
      {
        type: AuditEventType.CONTRACT_PACKAGE_CHANGED,
        targetId: "package",
        meta: { action: "package.published" },
      },
      "published",
    );
    expect(db.notificationEvent.create.mock.calls[0][0].data).toMatchObject({
      type: "contract.updated",
      permissionKey: "documents.read",
      targetPath: "/rentals/rental",
    });
  });
});
