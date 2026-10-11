import { ConflictException, NotFoundException } from "@nestjs/common";
import type { AccessService } from "../access/access.service";
import type { AccessSnapshot } from "../access/access.resolver";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { RentalsService } from "./rentals.service";

const snapshot: AccessSnapshot = {
  userId: "agent",
  isSuperAdmin: false,
  portalEligible: false,
  accessRevision: 1,
  roleVersions: [],
  effectiveScopes: {
    "rentals.create": ["ALL"],
    "rentals.handover": ["ALL"],
    "rentals.return": ["ALL"],
    "scooter_documents.write": ["ALL"],
  },
};

describe("Rental operational invariants", () => {
  const db = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    rental: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    scooter: { findFirst: jest.fn() },
    person: { findFirst: jest.fn() },
    scooterDocument: { findFirst: jest.fn(), update: jest.fn() },
  };
  const access = { getSnapshot: jest.fn() },
    audit = { recordRequired: jest.fn() };
  const service = new RentalsService(
    db as unknown as PrismaService,
    access as unknown as AccessService,
    audit as unknown as AuditService,
  );
  const now = new Date();
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(db),
    );
    access.getSnapshot.mockResolvedValue(snapshot);
    db.scooter.findFirst.mockResolvedValue({ id: "scooter" });
    db.person.findFirst.mockResolvedValue({ id: "person" });
  });

  it("checks overlapping reservations after acquiring the scooter lock", async () => {
    db.rental.findFirst.mockResolvedValue({ id: "existing" });
    await expect(
      service.create("agent", {
        scooterId: "scooter",
        personId: "person",
        startsAt: now.toISOString(),
        endsAt: new Date(now.getTime() + 60_000).toISOString(),
      }),
    ).rejects.toThrow(ConflictException);
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.rental.findFirst.mock.invocationCallOrder[0],
    );
    expect(db.rental.create).not.toHaveBeenCalled();
    expect(audit.recordRequired).not.toHaveBeenCalled();
  });

  it("refuses handover after the reservation period", async () => {
    db.rental.findUnique.mockResolvedValue({
      scooterId: "scooter",
      id: "rental",
      status: "reserved",
      revision: 1,
      startsAt: new Date(now.getTime() - 120_000),
      endsAt: new Date(now.getTime() - 60_000),
      scooter: { deletedAt: null },
      person: { deletedAt: null },
    });
    await expect(
      service.transition("agent", "rental", 1, "handover"),
    ).rejects.toThrow(ConflictException);
    expect(db.rental.update).not.toHaveBeenCalled();
  });

  it("cannot return the same rental twice", async () => {
    db.rental.findUnique.mockResolvedValue({
      scooterId: "scooter",
      id: "rental",
      status: "returned",
      revision: 2,
    });
    await expect(
      service.transition("agent", "rental", 2, "return"),
    ).rejects.toThrow(ConflictException);
    expect(db.rental.update).not.toHaveBeenCalled();
  });

  it("does not publish ineligible or deleted scooter documents", async () => {
    db.scooterDocument.findFirst.mockResolvedValue(null);
    await expect(
      service.visibility("agent", "civ-document", true),
    ).rejects.toThrow(NotFoundException);
    expect(db.scooterDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          type: { in: ["registration_certificate", "insurance"] },
        }) as unknown,
      }),
    );
    expect(db.scooterDocument.update).not.toHaveBeenCalled();
  });

  it("document publication requires a successful transactional audit", async () => {
    db.scooterDocument.findFirst.mockResolvedValue({
      id: "document",
      customerVisible: false,
    });
    audit.recordRequired.mockRejectedValue(new Error("audit unavailable"));
    await expect(service.visibility("agent", "document", true)).rejects.toThrow(
      "audit unavailable",
    );
    expect(audit.recordRequired).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        targetId: "document",
        meta: { before: false, after: true },
      }),
    );
  });
});
