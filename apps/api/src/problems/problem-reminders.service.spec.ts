import { ConflictException, ForbiddenException } from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import type { AccessService } from "../access/access.service";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ProblemPhotosService } from "./problem-photos.service";
import { ProblemsService } from "./problems.service";

const now = new Date("2026-11-04T12:00:00Z");
const admin = {
  userId: "admin",
  isAdmin: true,
  effectiveScopes: { "problems.assign": ["ALL"], "problems.read": ["ALL"] },
};
const mechanic = {
  userId: "mechanic",
  effectiveScopes: {
    "notifications.receive": ["ASSIGNED"],
    "problems.read": ["ASSIGNED"],
    "problems.update": ["ASSIGNED"],
    "problems.resolve": ["ASSIGNED"],
  },
};
const row = {
  id: "task",
  scooterId: "scooter",
  status: "open",
  revision: 1,
  title: "Check brakes",
  assignees: [{ id: "mechanic" }],
  assignee: null,
};

function fixture() {
  const db = {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ now }]),
    scooterProblem: {
      findUnique: jest.fn().mockResolvedValue({ scooterId: "scooter" }),
      findFirst: jest.fn().mockResolvedValue(row),
    },
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: "mechanic", roleMemberships: [] }),
      findMany: jest.fn().mockResolvedValue(
        ["admin", "mechanic", "other-admin"].map((id) => ({
          id,
          firstName: id,
          lastName: null,
          isSuperAdmin: id !== "mechanic",
          accessRevision: 1,
          roleMemberships:
            id === "mechanic"
              ? [
                  {
                    role: {
                      id: "role",
                      slug: "mechanic",
                      revision: 1,
                      archivedAt: null,
                      permissions: Object.entries(mechanic.effectiveScopes).map(
                        ([permissionKey, scopes]) => ({
                          permissionKey,
                          scopes,
                        }),
                      ),
                    },
                  },
                ]
              : [],
          permissionOverrides: [],
        })),
      ),
    },
    scooter: {
      findUnique: jest.fn().mockResolvedValue({
        id: "scooter",
        fleetNumber: 7,
        brand: { code: "HON" },
      }),
    },
    notificationEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "event" }),
    },
  };
  db.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
    callback(db),
  );
  const access = {
    getSnapshot: jest
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(id === "mechanic" ? mechanic : admin),
      ),
  };
  const service = new ProblemsService(
    db as unknown as PrismaService,
    access as unknown as AccessService,
    {} as AuditService,
    {} as ProblemPhotosService,
  );
  return { db, access, service };
}

describe("task reminders", () => {
  it("enqueues only the chosen assignee, retaining the actor and brand-code identity", async () => {
    const { db, service } = fixture();
    await expect(
      service.remind("admin", "task", { revision: 1, assigneeId: "mechanic" }),
    ).resolves.toEqual({
      sent: true,
      serverNow: now.toISOString(),
      nextAllowedAt: "2026-11-04T12:01:00.000Z",
    });
    expect(db.notificationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "issue.reminder",
        actorId: "admin",
        targetPath: "/problems/task",
        problemId: "task",
        createdAt: now,
        assignedRecipientIds: ["mechanic"],
        adminRecipientIds: [],
        scooter: { id: "scooter", fleetNumber: 7, brandCode: "HON" },
      }) as unknown,
    });
    const queries = db.$executeRaw.mock.calls.map(([strings]) =>
      (strings as unknown as string[]).join("?"),
    );
    expect(queries).toContain(
      "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
    );
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "ReadCommitted",
    });
  });
  it("shares the recipient cooldown across admins and tasks without another enqueue", async () => {
    const { db, service } = fixture();
    db.notificationEvent.findFirst.mockResolvedValue({
      createdAt: new Date(now.getTime() - 30_000),
    });
    await expect(
      service.remind("other-admin", "another-task", {
        revision: 1,
        assigneeId: "mechanic",
      }),
    ).resolves.toMatchObject({
      sent: false,
      nextAllowedAt: "2026-11-04T12:00:30.000Z",
    });
    expect(db.notificationEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gt: new Date(
              now.getTime() - v1.problems.PROBLEM_REMINDER_COOLDOWN_MS,
            ),
          },
          OR: [
            { assignedRecipientIds: { hasSome: ["mechanic"] } },
            { adminRecipientIds: { hasSome: ["mechanic"] } },
          ],
        }) as unknown,
      }),
    );
    expect(db.notificationEvent.create).not.toHaveBeenCalled();
  });
  it.each([
    "closed",
    "removed",
    "stale",
    "ineligible",
    "notifications disabled",
  ])("rejects %s work without publishing", async (state) => {
    const { db, access, service } = fixture();
    if (state === "closed")
      db.scooterProblem.findFirst.mockResolvedValue({
        ...row,
        status: "resolved",
      });
    if (state === "removed")
      db.scooterProblem.findFirst.mockResolvedValue({ ...row, assignees: [] });
    if (state === "stale")
      db.scooterProblem.findFirst.mockResolvedValue({ ...row, revision: 2 });
    if (state === "ineligible") db.user.findFirst.mockResolvedValue(null);
    if (state === "notifications disabled")
      access.getSnapshot.mockImplementation((id: string) =>
        Promise.resolve(
          id === "mechanic"
            ? {
                ...mechanic,
                effectiveScopes: {
                  ...mechanic.effectiveScopes,
                  "notifications.receive": [],
                },
              }
            : admin,
        ),
      );
    await expect(
      service.remind("admin", "task", { revision: 1, assigneeId: "mechanic" }),
    ).rejects.toThrow(ConflictException);
    expect(db.notificationEvent.create).not.toHaveBeenCalled();
  });
  it("rejects non-admins even with assignment permission", async () => {
    const { db, access, service } = fixture();
    access.getSnapshot.mockResolvedValue({ ...admin, isAdmin: false });
    await expect(
      service.remind("worker", "task", { revision: 1, assigneeId: "mechanic" }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("reports the shared cooldown after a reload", async () => {
    const { db, service } = fixture();
    db.notificationEvent.findMany.mockResolvedValue([
      {
        createdAt: now,
        assignedRecipientIds: ["mechanic"],
        adminRecipientIds: [],
      },
    ] as never);
    await expect(service.reminderStatus("admin", "task")).resolves.toEqual({
      serverNow: now.toISOString(),
      items: [
        { assigneeId: "mechanic", nextAllowedAt: "2026-11-04T12:01:00.000Z" },
      ],
    });
  });
  it("propagates an outbox failure inside the cooldown transaction", async () => {
    const { db, service } = fixture();
    db.notificationEvent.create.mockRejectedValue(
      new Error("outbox unavailable"),
    );
    await expect(
      service.remind("admin", "task", { revision: 1, assigneeId: "mechanic" }),
    ).rejects.toThrow("outbox unavailable");
    expect(db.notificationEvent.create).toHaveBeenCalledTimes(1);
  });
});
