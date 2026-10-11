import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import type { AccessService } from "../access/access.service";
import type { AccessSnapshot } from "../access/access.resolver";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
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
  description: "Brake issue",
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
    brand: { name: "Brand" },
  },
};

describe("ProblemsService authorization and write conflicts", () => {
  const db = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    scooterProblem: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    user: { findFirst: jest.fn() },
  };
  const access = { getSnapshot: jest.fn() },
    audit = { recordRequired: jest.fn() };
  const service = new ProblemsService(
    db as unknown as PrismaService,
    access as unknown as AccessService,
    audit as unknown as AuditService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(db),
    );
    access.getSnapshot.mockResolvedValue(snapshot);
    db.scooterProblem.findFirst.mockResolvedValue(row);
    db.scooterProblem.updateMany.mockResolvedValue({ count: 1 });
    db.scooterProblem.findUniqueOrThrow.mockResolvedValue({
      ...row,
      revision: 2,
    });
    db.user.findFirst.mockResolvedValue({
      id: "mechanic",
      firstName: "Alex",
      lastName: null,
    });
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
    db.scooterProblem.findFirst.mockResolvedValue({ ...row, assigneeId: null });
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
    db.scooterProblem.findFirst.mockResolvedValue({ ...row, assigneeId: null });
    const result = await service.get("mechanic", "problem");
    expect(result).not.toHaveProperty("workNotes");
    expect(result).not.toHaveProperty("resolutionNotes");
    expect(result).not.toHaveProperty("reporterId");
    expect(result.scooter).not.toHaveProperty("notes");
  });
});
