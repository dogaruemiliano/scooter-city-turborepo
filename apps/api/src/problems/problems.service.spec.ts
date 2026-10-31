import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import type { AccessService } from "../access/access.service";
import type { AccessSnapshot } from "../access/access.resolver";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ProblemPhotosService } from "./problem-photos.service";
import { ProblemsService } from "./problems.service";

const snapshot: AccessSnapshot = {
  userId: "mechanic",
  isSuperAdmin: false,
  portalEligible: false,
  accessRevision: 1,
  roleVersions: [],
  effectiveScopes: {
    "problems.read": ["ASSIGNED", "AVAILABLE"],
    "problems.update": ["ASSIGNED"],
    "problems.resolve": ["ASSIGNED"],
    "problems.claim": ["AVAILABLE"],
  },
};
const row = {
  id: "problem",
  scooterId: "scooter",
  title: "Brake issue",
  description: "Brake issue",
  difficulty: "hard",
  severity: "critical",
  blocksUsage: false,
  holdClearedAt: null,
  photos: [],
  checklist: [],
  sections: [],
  buyList: [],
  location: null,
  assignee: { id: "mechanic", firstName: "Alex", lastName: null },
  reporter: { id: "manager", firstName: "Manager", lastName: null },
  priority: "high",
  status: "open",
  reporterId: "manager",
  assigneeId: "mechanic",
  revision: 1,
  workNotes: "Internal diagnosis",
  resolutionNotes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  resolvedAt: null,
  scooter: {
    id: "scooter",
    fleetNumber: 1,
    model: "City",
    registrationNumber: null,
    brand: { name: "Brand", code: "BRD" },
  },
};

describe("ProblemsService authorization and write conflicts", () => {
  const db = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    scooterProblem: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    user: { findFirst: jest.fn(), findMany: jest.fn() },
    scooter: { findFirst: jest.fn(), findMany: jest.fn() },
    businessLocation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    auditEvent: { findMany: jest.fn(), count: jest.fn() },
  };
  const access = { getSnapshot: jest.fn() },
    audit = { recordRequired: jest.fn() };
  const service = new ProblemsService(
    db as unknown as PrismaService,
    access as unknown as AccessService,
    audit as unknown as AuditService,
    {
      prepare: jest.fn(),
      attach: jest.fn(),
    } as unknown as ProblemPhotosService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(db),
    );
    access.getSnapshot.mockResolvedValue(snapshot);
    db.scooterProblem.findFirst.mockResolvedValue(row);
    db.scooterProblem.findUnique.mockResolvedValue({ scooterId: "scooter" });
    db.scooterProblem.updateMany.mockResolvedValue({ count: 1 });
    db.scooterProblem.findUniqueOrThrow.mockResolvedValue({
      ...row,
      revision: 2,
    });
    db.user.findFirst.mockResolvedValue({
      id: "mechanic",
      firstName: "Alex",
      lastName: null,
      roleMemberships: [],
    });
  });

  it("rejects todo creation and listing for non-admins with full problem grants", async () => {
    access.getSnapshot.mockResolvedValue({
      ...snapshot,
      effectiveScopes: {
        "problems.create": ["ALL"],
        "problems.read": ["ALL"],
      },
    });
    await expect(
      service.create(
        "mechanic",
        v1.problems.createProblemInputSchema.parse({
          scooterId: null,
          title: "Order supplies",
          difficulty: "easy",
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.list("mechanic", { kind: "todo", page: 1, pageSize: 25 }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.scooterProblem.create).not.toHaveBeenCalled();
  });

  it("isolates the admin todo list and all quick-filter counts from scooter issues", async () => {
    access.getSnapshot.mockResolvedValue({ ...snapshot, isSuperAdmin: true });
    db.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
    db.scooterProblem.findMany.mockResolvedValue([]);
    db.scooterProblem.count.mockResolvedValue(0);
    await service.list("admin", { kind: "todo", page: 1, pageSize: 25 });
    const listCalls = db.scooterProblem.findMany.mock.calls as [
      { where: { AND: unknown[] } },
    ][];
    expect(listCalls[0][0].where.AND).toContainEqual({ scooterId: null });
    const counts = db.scooterProblem.count.mock.calls as [
      { where: { AND: { AND: unknown[] }[] } },
    ][];
    // Total count uses the list predicate; each quick-filter count uses its shared base.
    expect(counts[0][0].where.AND).toContainEqual({ scooterId: null });
    expect(counts[1][0].where.AND).toContainEqual({ scooterId: null });
    for (const [query] of counts.slice(2))
      expect(query.where.AND[0].AND).toContainEqual({ scooterId: null });
  });

  it("creates an admin todo without looking up or locking a scooter", async () => {
    access.getSnapshot.mockResolvedValue({
      ...snapshot,
      isAdmin: true,
      effectiveScopes: {
        "problems.create": ["ALL"],
        "problems.read": ["ALL"],
      },
    });
    const todo = { ...row, scooterId: null, scooter: null, difficulty: null };
    db.scooterProblem.create.mockResolvedValue(todo);
    db.scooterProblem.findUniqueOrThrow.mockResolvedValue(todo);
    const result = await service.create(
      "admin",
      v1.problems.createProblemInputSchema.parse({
        scooterId: null,
        title: "Order supplies",
      }),
    );
    expect(result.scooter).toBeNull();
    expect(result.scooterId).toBeNull();
    expect(result.difficulty).toBeNull();
    expect(db.scooter.findFirst).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(
      (db.scooterProblem.create.mock.calls as unknown[][])[0]?.[0],
    ).toMatchObject({ data: { scooterId: null, blocksUsage: false } });
  });

  describe("todo assignee eligibility", () => {
    const admin = {
      ...snapshot,
      isAdmin: true,
      effectiveScopes: {
        "problems.create": ["ALL"],
        "problems.read": ["ALL"],
        "problems.assign": ["ALL"],
        "problems.update": ["ALL"],
        "problems.resolve": ["ALL"],
        "problems.claim": ["ALL"],
      },
    };
    const todo = { ...row, scooterId: null, scooter: null, difficulty: null };

    beforeEach(() => {
      access.getSnapshot.mockImplementation((id: string) =>
        Promise.resolve(id === "mechanic" ? snapshot : admin),
      );
      db.scooterProblem.findFirst.mockResolvedValue(todo);
      db.scooterProblem.findUnique.mockResolvedValue({ scooterId: null });
      db.scooterProblem.findUniqueOrThrow.mockResolvedValue(todo);
      db.scooterProblem.create.mockResolvedValue(todo);
    });

    it.each(["create", "assign"] as const)(
      "rejects mechanics on todo %s",
      async (action) => {
        const request =
          action === "create"
            ? service.create(
                "admin",
                v1.problems.createProblemInputSchema.parse({
                  scooterId: null,
                  title: "Order supplies",
                  assigneeIds: ["mechanic"],
                }),
              )
            : service.assign("admin", row.id, {
                revision: 1,
                assigneeIds: ["mechanic"],
              });
        await expect(request).rejects.toThrow(ConflictException);
        expect(db.scooterProblem.create).not.toHaveBeenCalled();
        expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
      },
    );

    it.each([
      { isAdmin: true, isSuperAdmin: false },
      { isAdmin: false, isSuperAdmin: true },
    ])("accepts admin assignees %j", async (designation) => {
      access.getSnapshot.mockImplementation((id: string) =>
        Promise.resolve(id === "target" ? { ...admin, ...designation } : admin),
      );
      await expect(
        service.create(
          "admin",
          v1.problems.createProblemInputSchema.parse({
            scooterId: null,
            title: "Order supplies",
            assigneeIds: ["target"],
          }),
        ),
      ).resolves.toBeDefined();
      await expect(
        service.assign("admin", row.id, {
          revision: 1,
          assigneeIds: ["target"],
        }),
      ).resolves.toBeDefined();
    });

    it("only lists eligible admins for todo assignment", async () => {
      db.user.findMany.mockResolvedValue([{ id: "mechanic" }, { id: "admin" }]);
      db.user.findFirst.mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve({
            id: where.id,
            firstName: where.id,
            lastName: null,
            roleMemberships: [],
          }),
      );
      const result = await service.assignees("admin", "", "todo");
      expect(result.items.map(({ id }) => id)).toEqual(["admin"]);
      const scooterResult = await service.assignees("admin", "", "scooter");
      expect(scooterResult.items.map(({ id }) => id)).toEqual([
        "mechanic",
        "admin",
      ]);
    });

    it("rejects a mechanic claiming an unassigned todo", async () => {
      db.scooterProblem.findFirst.mockResolvedValue({
        ...todo,
        assigneeId: null,
        assignee: null,
        assignees: [],
      });
      await expect(service.claim("mechanic", row.id, 1)).rejects.toThrow(
        ForbiddenException,
      );
      expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
    });

    it("flags a mechanic already assigned to a todo for reassignment", async () => {
      const result = await service.get("admin", row.id);
      expect(result?.assigneeNeedsReassignment).toBe(true);
    });
  });

  describe("full edit updates", () => {
    const admin = {
      ...snapshot,
      isAdmin: true,
      effectiveScopes: {
        "problems.read": ["ALL"],
        "problems.update": ["ALL"],
        "problems.resolve": ["ALL"],
        "problems.assign": ["ALL"],
      },
    };
    it("saves fields, assignees, and scooter condition in the same transaction", async () => {
      access.getSnapshot.mockResolvedValue(admin);
      await service.update("admin", row.id, {
        revision: 1,
        title: "Changed title",
        description: "Changed description",
        assigneeIds: ["target"],
        blocksUsage: true,
      });
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(db.scooterProblem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "Changed title",
            description: "Changed description",
            assigneeId: "target",
            blocksUsage: true,
            holdClearedAt: null,
            holdClearedById: null,
          }) as unknown,
        }),
      );
      expect(db.scooterProblem.update).toHaveBeenCalledWith({
        where: { id: row.id },
        data: { assignees: { set: [{ id: "target" }] } },
      });
    });
    it("requires assignment permission when changing assignees through edit", async () => {
      access.getSnapshot.mockResolvedValue({
        ...admin,
        effectiveScopes: { "problems.update": ["ALL"] },
      });
      await expect(
        service.update("admin", row.id, {
          revision: 1,
          title: "Changed",
          assigneeIds: [],
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
    });
    it("rejects mechanic assignment to a todo before saving any edits", async () => {
      access.getSnapshot.mockImplementation((id: string) =>
        Promise.resolve(id === "mechanic" ? snapshot : admin),
      );
      db.scooterProblem.findFirst.mockResolvedValue({
        ...row,
        scooterId: null,
        scooter: null,
      });
      db.scooterProblem.findUnique.mockResolvedValue({ scooterId: null });
      await expect(
        service.update("admin", row.id, {
          revision: 1,
          title: "Changed",
          assigneeIds: ["mechanic"],
        }),
      ).rejects.toThrow(ConflictException);
      expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
    });
    it("rejects maintenance holds on todos before saving any edits", async () => {
      access.getSnapshot.mockResolvedValue(admin);
      db.scooterProblem.findFirst.mockResolvedValue({
        ...row,
        scooterId: null,
        scooter: null,
      });
      db.scooterProblem.findUnique.mockResolvedValue({ scooterId: null });
      await expect(
        service.update("admin", row.id, {
          revision: 1,
          title: "Changed",
          blocksUsage: true,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
    });
  });

  it("excludes todos from every non-admin record authorization query", async () => {
    await service.get("mechanic", "problem");
    expect(db.scooterProblem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { id: "problem" },
            {
              AND: [
                expect.anything(),
                {
                  OR: [{ scooter: { deletedAt: null } }],
                },
              ],
            },
          ],
        },
      }),
    );
  });

  it("allows admins to complete todos without a scooter lock", async () => {
    access.getSnapshot.mockResolvedValue({ ...snapshot, isSuperAdmin: true });
    const todo = { ...row, scooterId: null, scooter: null, difficulty: null };
    db.scooterProblem.findUnique.mockResolvedValue({ scooterId: null });
    db.scooterProblem.findFirst.mockResolvedValue(todo);
    db.scooterProblem.findUniqueOrThrow.mockResolvedValue({
      ...todo,
      status: "resolved",
    });
    await service.resolve("admin", "problem", {
      revision: 1,
      resolutionNotes: "Done",
    });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      (db.scooterProblem.updateMany.mock.calls as unknown[][])[0]?.[0],
    ).toMatchObject({ data: { status: "resolved" } });
  });

  it("persists optional sections during creation and resolves saved locations", async () => {
    access.getSnapshot.mockResolvedValue({ ...snapshot, isSuperAdmin: true });
    db.scooter.findFirst.mockResolvedValue({ id: "scooter" });
    db.scooterProblem.create.mockResolvedValue(row);
    const saved = {
      id: "workshop",
      name: "Workshop",
      address: "10 Main Street",
    };
    db.businessLocation.findUnique.mockResolvedValue(saved);
    const sections = ["checklist", "buyList", "location"] as const;
    const checklist = [
      { id: "brakes", text: "Check brakes", completed: false },
    ];
    const buyList = [{ id: "pads", text: "Brake pads", completed: false }];
    await service.create(
      "admin",
      v1.problems.createProblemInputSchema.parse({
        scooterId: "scooter",
        title: "Service",
        difficulty: "easy",
        sections,
        checklist,
        buyList,
        location: {
          name: "Untrusted",
          address: "Untrusted",
          savedLocationId: saved.id,
        },
      }),
    );
    expect(db.scooterProblem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sections,
          checklist,
          buyList,
          location: {
            name: saved.name,
            address: saved.address,
            savedLocationId: saved.id,
          },
        }) as unknown,
      }),
    );
    expect(audit.recordRequired).toHaveBeenCalled();
  });

  it("returns difficulty alongside the unchanged original severity", async () => {
    db.scooterProblem.findFirst.mockResolvedValue(row);
    const result = await service.get("mechanic", "problem");
    expect(result).toMatchObject({
      difficulty: "hard",
      legacySeverity: "critical",
    });
  });

  it("returns the scooter cover URL with problem details", async () => {
    db.scooterProblem.findFirst.mockResolvedValue({
      ...row,
      scooter: { ...row.scooter, photos: [{ id: "cover" }] },
    });
    const result = await service.get("mechanic", "problem");
    expect(result.scooter?.coverUrl).toBe(
      v1.scooters.ROUTES.photos.content("scooter", "cover"),
    );
    expect(result.scooter?.brandCode).toBe("BRD");
    const calls = db.scooterProblem.findFirst.mock.calls as unknown[][];
    expect(calls[0]?.[0]).toMatchObject({
      include: {
        scooter: {
          select: {
            photos: {
              where: {
                deletedAt: null,
                type: "GALLERY_COVER",
                asset: { deletedAt: null },
              },
              take: 1,
            },
          },
        },
      },
    });
  });

  it("returns no scooter cover URL when no cover is available", async () => {
    db.scooterProblem.findFirst.mockResolvedValue({
      ...row,
      scooter: { ...row.scooter, photos: [] },
    });
    expect(
      (await service.get("mechanic", "problem")).scooter?.coverUrl,
    ).toBeNull();
  });

  it.each([false, true])(
    "combines multiple assignees and unassigned=%s within the visible problem scope",
    async (unassigned) => {
      db.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      );
      db.scooterProblem.findMany.mockResolvedValue([]);
      db.scooterProblem.count.mockResolvedValue(0);
      await service.list("mechanic", {
        page: 1,
        pageSize: 25,
        assigneeIds: ["mechanic", "other"],
        unassigned,
      });
      expect(db.scooterProblem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              expect.anything(),
              { scooterId: { not: null } },
              {},
              expect.objectContaining({
                OR: [
                  { assigneeId: { in: ["mechanic", "other"] } },
                  {
                    assignees: { some: { id: { in: ["mechanic", "other"] } } },
                  },
                  ...(unassigned
                    ? [{ assigneeId: null, assignees: { none: {} } }]
                    : []),
                ],
              }),
            ],
          },
        }),
      );
    },
  );

  it("counts every quick filter across pages using the same read permissions", async () => {
    db.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
    db.scooterProblem.findMany.mockResolvedValue([]);
    for (const count of [15, 60, 20, 15, 7, 25]) {
      db.scooterProblem.count.mockResolvedValueOnce(count);
    }
    const result = await service.list("mechanic", {
      page: 2,
      pageSize: 25,
      status: "in_progress",
      view: "assigned",
      difficulty: "hard",
    });
    expect(result.quickFilterCounts).toEqual({
      all: 60,
      open: 20,
      in_progress: 15,
      mine: 7,
      resolved: 25,
    });
    const countCalls = db.scooterProblem.count.mock.calls as [
      { where: { AND: unknown[] } },
    ][];
    const findCalls = db.scooterProblem.findMany.mock.calls as [
      { where: { AND: unknown[] } },
    ][];
    const base = countCalls[1][0].where;
    expect(base.AND[2]).toEqual({ difficulty: "hard" });
    expect(base.AND[0]).toEqual({ scooterId: { not: null } });
    expect(base.AND[1]).toEqual(findCalls[0][0].where.AND[0]);
    expect(countCalls[4][0].where).toEqual({
      AND: [
        base,
        {
          OR: [
            { assigneeId: "mechanic" },
            { assignees: { some: { id: "mechanic" } } },
          ],
        },
      ],
    });
    expect(result.total).toBe(15);
  });

  it("includes roles and the Super Admin designation in assignee filter options", async () => {
    db.scooter.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([
      {
        id: "admin",
        firstName: "Alex",
        lastName: null,
        isSuperAdmin: true,
        roleMemberships: [{ role: { name: "Mechanic" } }],
      },
    ]);
    const result = v1.problems.problemFilterOptionsSchema.parse(
      await service.filterOptions("mechanic"),
    );
    expect(result.assignees[0]).toMatchObject({
      roles: ["Mechanic"],
      isSuperAdmin: true,
    });
  });

  it("includes email in eligible assignees so nameless accounts have a readable fallback", async () => {
    access.getSnapshot.mockResolvedValueOnce({
      ...snapshot,
      effectiveScopes: { "problems.assign": ["ALL"] },
    });
    db.user.findMany.mockResolvedValue([{ id: "mechanic" }]);
    db.user.findFirst.mockResolvedValue({
      id: "mechanic",
      firstName: null,
      lastName: null,
      email: "mechanic@example.com",
      roleMemberships: [{ role: { name: "Mechanic" } }],
    });
    const result = await service.assignees("admin", "mechanic@example.com");
    expect(result.items).toEqual([
      {
        id: "mechanic",
        firstName: null,
        lastName: null,
        email: "mechanic@example.com",
        roles: ["Mechanic"],
      },
    ]);
    expect(db.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ email: true }) as unknown,
      }),
    );
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              email: { contains: "mechanic@example.com", mode: "insensitive" },
            },
          ]) as unknown,
        }) as unknown,
      }),
    );
  });

  it("pauses work without overwriting assignment or saved progress", async () => {
    db.scooterProblem.findFirst.mockResolvedValue({
      ...row,
      status: "in_progress",
    });
    await service.update("mechanic", "problem", {
      revision: 1,
      pauseWork: true,
    });
    expect(db.scooterProblem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "open", revision: { increment: 1 } },
      }),
    );
    expect(audit.recordRequired).toHaveBeenCalled();
  });
  it("rejects pausing a problem that has not started", async () => {
    await expect(
      service.update("mechanic", "problem", { revision: 1, pauseWork: true }),
    ).rejects.toThrow("Only work in progress can be paused");
    expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
  });
  it("saves and audits checklist changes for the assigned mechanic", async () => {
    const checklist = [
      { id: "pads", text: "Install brake pads", completed: true },
    ];
    db.scooterProblem.findUniqueOrThrow.mockResolvedValue({
      ...row,
      revision: 2,
      checklist,
    });
    const result = await service.update("mechanic", "problem", {
      revision: 1,
      checklist,
    });
    expect(result.checklist).toEqual(checklist);
    expect(db.scooterProblem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          checklist,
          revision: { increment: 1 },
        }) as unknown,
      }),
    );
    expect(audit.recordRequired).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        meta: expect.objectContaining({
          after: expect.objectContaining({ checklist }) as unknown,
        }) as unknown,
      }),
    );
  });

  it.each([
    { checklist: [] },
    { buyList: [] },
    { sections: ["buyList"] as ["buyList"] },
    {
      location: {
        name: "Workshop",
        address: "Main Street",
        savedLocationId: null,
      },
    },
  ])("denies task section edits by a non-assignee: %j", async (input) => {
    db.scooterProblem.findFirst.mockResolvedValue({
      ...row,
      assigneeId: "other",
      assignee: { id: "other", firstName: "Other", lastName: null },
      assignees: [],
    });
    await expect(
      service.update("mechanic", "problem", { revision: 1, ...input }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
  });

  it("persists and audits buy lists, location and section selection", async () => {
    const input = {
      sections: ["buyList", "location"] as ["buyList", "location"],
      buyList: [{ id: "tire", text: "Rear tire", completed: true }],
      location: {
        name: "Customer pickup",
        address: "25 Park Road",
        savedLocationId: null,
      },
    };
    db.scooterProblem.findUniqueOrThrow.mockResolvedValue({
      ...row,
      ...input,
      revision: 2,
    });
    const result = await service.update("mechanic", "problem", {
      revision: 1,
      ...input,
    });
    expect(result).toMatchObject(input);
    expect(db.scooterProblem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining(input) as unknown,
      }),
    );
    expect(audit.recordRequired).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        meta: expect.objectContaining({
          after: expect.objectContaining(input) as unknown,
        }) as unknown,
      }),
    );
  });

  it("uses the saved location's canonical address instead of client-supplied text", async () => {
    const saved = {
      id: "workshop",
      name: "Workshop",
      address: "10 Main Street",
    };
    db.businessLocation.findUnique.mockResolvedValue(saved);
    await service.update("mechanic", "problem", {
      revision: 1,
      location: {
        name: "Wrong",
        address: "Wrong address",
        savedLocationId: saved.id,
      },
    });
    expect(db.scooterProblem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          location: {
            name: saved.name,
            address: saved.address,
            savedLocationId: saved.id,
          },
        }) as unknown,
      }),
    );
  });

  it("rejects missing saved locations before updating a task", async () => {
    db.businessLocation.findUnique.mockResolvedValue(null);
    await expect(
      service.update("mechanic", "problem", {
        revision: 1,
        location: {
          name: "Missing",
          address: "Address",
          savedLocationId: "missing",
        },
      }),
    ).rejects.toThrow("Saved location not found");
    expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
  });

  it("allows an admin to update another assignee's checklist", async () => {
    access.getSnapshot.mockResolvedValue({
      ...snapshot,
      userId: "admin",
      effectiveScopes: { "problems.update": ["ALL"], "problems.read": ["ALL"] },
    });
    await expect(
      service.update("admin", "problem", { revision: 1, checklist: [] }),
    ).resolves.toHaveProperty("checklist", []);
  });

  it("rejects checklist changes to closed tasks", async () => {
    db.scooterProblem.findFirst.mockResolvedValue({
      ...row,
      status: "resolved",
    });
    await expect(
      service.update("mechanic", "problem", { revision: 1, checklist: [] }),
    ).rejects.toThrow(ConflictException);
    expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
  });

  it("rejects extra attachments beyond the task photo limit", async () => {
    db.scooterProblem.findFirst.mockResolvedValue({
      ...row,
      photos: Array(10).fill({}),
    });
    await expect(
      service.update("mechanic", "problem", {
        revision: 1,
        photos: [{ uploadToken: "token", fileName: "pads.jpg" }],
      }),
    ).rejects.toThrow("Too many problem photos");
    expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
  });

  it("uses fresh assigned-scope filters and does not mutate an inaccessible problem", async () => {
    db.scooterProblem.findFirst.mockResolvedValue(null);
    await expect(
      service.resolve("mechanic", "problem", {
        revision: 1,
        resolutionNotes: "Fixed",
      }),
    ).rejects.toThrow(NotFoundException);
    expect(JSON.stringify(db.scooterProblem.findFirst.mock.calls[0])).toContain(
      '"assigneeId":"mechanic"',
    );
    expect(access.getSnapshot).toHaveBeenCalledWith("mechanic", db);
    expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a stale revision before a mechanic can overwrite reassignment", async () => {
    db.scooterProblem.findFirst.mockResolvedValue({ ...row, revision: 2 });
    await expect(
      service.update("mechanic", "problem", {
        revision: 1,
        workNotes: "stale work",
      }),
    ).rejects.toThrow(ConflictException);
    expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
    expect(audit.recordRequired).not.toHaveBeenCalled();
  });

  it("turns a lost conditional claim into conflict with no success audit", async () => {
    db.scooterProblem.findFirst.mockResolvedValue({
      ...row,
      assigneeId: null,
      assignee: null,
      assignees: [],
    });
    db.scooterProblem.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.claim("mechanic", "problem", 1)).rejects.toThrow(
      ConflictException,
    );
    expect(db.scooterProblem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "problem", revision: 1, assigneeId: null, status: "open" },
        data: expect.objectContaining({ assigneeId: "mechanic" }) as unknown,
      }),
    );
    expect(audit.recordRequired).not.toHaveBeenCalled();
  });

  it("does not allow assigned update authority to cancel a problem", async () => {
    await expect(service.cancel("mechanic", "problem", 1)).rejects.toThrow(
      ForbiddenException,
    );
    expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
  });

  it("does not accept assignee, priority, or status fields through mechanic update or claim", () => {
    expect(
      v1.problems.updateProblemInputSchema.safeParse({
        revision: 1,
        assigneeId: "other",
      }).success,
    ).toBe(false);
    expect(
      v1.problems.updateProblemInputSchema.safeParse({
        revision: 1,
        priority: "urgent",
      }).success,
    ).toBe(false);
    expect(
      v1.problems.updateProblemInputSchema.safeParse({
        revision: 1,
        status: "resolved",
      }).success,
    ).toBe(false);
    expect(
      v1.problems.revisionInputSchema.safeParse({
        revision: 1,
        assigneeId: "other",
      }).success,
    ).toBe(false);
  });

  it("removes work notes from the available queue projection", async () => {
    db.scooterProblem.findFirst.mockResolvedValue({
      ...row,
      assigneeId: null,
      assignee: null,
      assignees: [],
    });
    const result = await service.get("mechanic", "problem");
    expect(result).not.toHaveProperty("workNotes");
    expect(result).not.toHaveProperty("resolutionNotes");
    expect(result).not.toHaveProperty("reporterId");
    expect(result.scooter).not.toHaveProperty("notes");
  });

  it.each([undefined, false, true])(
    "automatically clears this problem's hold on resolution (legacy decision: %s)",
    async (clearMaintenanceHold) => {
      db.scooterProblem.findFirst.mockResolvedValue({
        ...row,
        blocksUsage: true,
      });
      await service.resolve("mechanic", "problem", {
        revision: 1,
        resolutionNotes: "Belt replaced",
        ...(clearMaintenanceHold === undefined ? {} : { clearMaintenanceHold }),
      });
      expect(db.scooterProblem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "problem",
            revision: 1,
          }) as unknown,
          data: expect.objectContaining({
            status: "resolved",
            blocksUsage: false,
            holdClearedAt: expect.any(Date) as unknown,
            holdClearedById: "mechanic",
          }) as unknown,
        }),
      );
    },
  );

  it("automatically clears only the dismissed problem's hold", async () => {
    access.getSnapshot.mockResolvedValue({ ...snapshot, isSuperAdmin: true });
    db.scooterProblem.findFirst.mockResolvedValue({
      ...row,
      blocksUsage: true,
    });
    await service.cancel("manager", "problem", 1);
    expect(db.scooterProblem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "problem" }) as unknown,
        data: expect.objectContaining({
          status: "cancelled",
          blocksUsage: false,
          holdClearedById: "manager",
        }) as unknown,
      }),
    );
  });

  it("rejects adding a hold to closed work", async () => {
    db.scooterProblem.findFirst.mockResolvedValue({
      ...row,
      status: "resolved",
    });
    await expect(
      service.hold("mechanic", "problem", { revision: 1, blocksUsage: true }),
    ).rejects.toThrow("Only open work");
    expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
  });

  it("clears only this hold and records who cleared it", async () => {
    db.scooterProblem.findFirst.mockResolvedValue({
      ...row,
      blocksUsage: true,
    });
    await service.resolve("mechanic", "problem", {
      revision: 1,
      resolutionNotes: "Safety inspection passed",
      clearMaintenanceHold: true,
    });
    expect(db.scooterProblem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blocksUsage: false,
          holdClearedById: "mechanic",
          holdClearedAt: expect.any(Date) as unknown,
        }) as unknown,
      }),
    );
  });

  it("locks the scooter before locking or changing the report", async () => {
    await service.hold("mechanic", "problem", {
      revision: 1,
      blocksUsage: true,
    });
    expect(
      (
        db.$queryRaw.mock.calls as unknown as [
          TemplateStringsArray,
          ...unknown[],
        ][]
      )[0][0].join(""),
    ).toContain('FROM "Scooter"');
    expect(
      (
        db.$queryRaw.mock.calls as unknown as [
          TemplateStringsArray,
          ...unknown[],
        ][]
      )[1][0].join(""),
    ).toContain('FROM "ScooterProblem"');
    expect(db.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      db.scooterProblem.updateMany.mock.invocationCallOrder[0],
    );
  });

  it("preserves progress during reassignment", async () => {
    access.getSnapshot.mockResolvedValue({ ...snapshot, isSuperAdmin: true });
    db.scooterProblem.findFirst.mockResolvedValue({
      ...row,
      status: "in_progress",
    });
    await service.assign("manager", "problem", {
      revision: 1,
      assigneeId: "mechanic",
    });
    expect(db.scooterProblem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { assigneeId: "mechanic", revision: { increment: 1 } },
      }),
    );
  });

  it("requires a nonblank reopening message before writing", () => {
    expect(() =>
      service.reopen("manager", "problem", { revision: 1, message: "   " }),
    ).toThrow();
    expect(db.scooterProblem.updateMany).not.toHaveBeenCalled();
  });
  it("returns completion and reopening messages to a scoped reader", async () => {
    db.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
    db.auditEvent.findMany.mockResolvedValue([
      {
        id: "complete",
        type: "PROBLEM_RESOLVED",
        user: row.assignee,
        createdAt: row.createdAt,
        meta: {
          after: { status: "resolved", resolutionNotes: "Brakes replaced" },
        },
      },
      {
        id: "reopen",
        type: "PROBLEM_REOPENED",
        user: row.assignee,
        createdAt: row.createdAt,
        meta: { note: "Noise returned", after: { status: "open" } },
      },
    ]);
    db.auditEvent.count.mockResolvedValue(2);
    const result = await service.activity("mechanic", "problem", {
      kind: "comments",
      page: 1,
      pageSize: 25,
    });
    expect(result.items.map(({ note }) => note)).toEqual([
      "Brakes replaced",
      "Noise returned",
    ]);
    expect(
      result.items.every(({ actor }) => actor?.id === row.assignee?.id),
    ).toBe(true);
  });
  it("keeps the previous resolution, assignee and hold when reopening", async () => {
    access.getSnapshot.mockResolvedValue({ ...snapshot, isSuperAdmin: true });
    db.scooterProblem.findFirst.mockResolvedValue({
      ...row,
      status: "resolved",
      resolutionNotes: "Belt replaced",
      blocksUsage: true,
    });
    await service.reopen("manager", "problem", {
      revision: 1,
      message: "Noise returned",
    });
    expect(audit.recordRequired).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "PROBLEM_REOPENED",
        meta: expect.objectContaining({ note: "Noise returned" }) as unknown,
      }),
    );
    expect(db.scooterProblem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "open", resolvedAt: null, revision: { increment: 1 } },
      }),
    );
  });

  it("rejects stale comments without recording a success", async () => {
    db.scooterProblem.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.comment("mechanic", "problem", {
        revision: 1,
        body: "Inspected brakes",
      }),
    ).rejects.toThrow(ConflictException);
    expect(audit.recordRequired).not.toHaveBeenCalled();
  });

  it.each(["comments", "activity"] as const)(
    "filters %s before counting and paginating",
    async (kind) => {
      access.getSnapshot.mockResolvedValue({ ...snapshot, isAdmin: true });
      db.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      );
      db.auditEvent.findMany.mockResolvedValue([]);
      db.auditEvent.count.mockResolvedValue(0);
      await service.activity("mechanic", "problem", {
        kind,
        page: 2,
        pageSize: 10,
      });
      const expected = v1.problems.problemActivityTypeSchema.options.filter(
        (type) =>
          kind === "comments"
            ? (
                v1.problems.problemConversationTypes as readonly string[]
              ).includes(type)
            : type !== "PROBLEM_COMMENTED",
      );
      expect(db.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: { in: expected } }) as unknown,
          skip: 10,
          take: 10,
        }),
      );
      expect(db.auditEvent.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ type: { in: expected } }) as unknown,
      });
    },
  );

  it.each([{ isSuperAdmin: true }, { isAdmin: true }])(
    "allows administrative activity access %j",
    async (admin) => {
      access.getSnapshot.mockResolvedValue({ ...snapshot, ...admin });
      db.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      );
      db.auditEvent.findMany.mockResolvedValue([]);
      db.auditEvent.count.mockResolvedValue(0);
      await expect(
        service.activity("mechanic", "problem", {
          kind: "activity",
          page: 1,
          pageSize: 25,
        }),
      ).resolves.toMatchObject({ total: 0 });
    },
  );
  it("limits legacy unfiltered history to comments for non-admins", async () => {
    db.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
    db.auditEvent.findMany.mockResolvedValue([]);
    db.auditEvent.count.mockResolvedValue(0);
    await service.activity("mechanic", "problem", { page: 1, pageSize: 25 });
    expect(db.auditEvent.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        type: {
          in: expect.arrayContaining([
            ...v1.problems.problemConversationTypes,
          ]) as unknown,
        },
      }) as unknown,
    });
  });
  it("denies explicit activity to non-admins", async () => {
    await expect(
      service.activity("mechanic", "problem", {
        kind: "activity",
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.auditEvent.findMany).not.toHaveBeenCalled();
  });

  it("only returns allowlisted history and preserves resolution notes", async () => {
    access.getSnapshot.mockResolvedValue({ ...snapshot, isAdmin: true });
    db.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
    db.auditEvent.findMany.mockResolvedValue([
      {
        id: "event",
        type: "PROBLEM_RESOLVED",
        user: row.assignee,
        createdAt: row.createdAt,
        ip: "private",
        meta: {
          after: {
            status: "resolved",
            resolutionNotes: "Fixed brakes",
            secret: "hidden",
          },
        },
      },
    ]);
    db.auditEvent.count.mockResolvedValue(1);
    const history = await service.activity("mechanic", "problem", {
      page: 1,
      pageSize: 25,
    });
    expect(history.items[0]).toMatchObject({
      actor: row.assignee,
      note: "Fixed brakes",
      after: { status: "resolved" },
    });
    expect(history.items[0]).not.toHaveProperty("ip");
    expect(history.items[0].after).not.toHaveProperty("secret");
    expect(history.items[0].after).not.toHaveProperty("resolutionNotes");
  });
});
