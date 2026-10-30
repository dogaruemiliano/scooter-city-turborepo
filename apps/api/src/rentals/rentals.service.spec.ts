import { ConflictException, NotFoundException } from "@nestjs/common";
import type { AccessService } from "../access/access.service";
import type { AccessSnapshot } from "../access/access.resolver";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { RentalsService } from "./rentals.service";
import { v1 } from "@repo/api-shared";

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
    scooterProblem: { findFirst: jest.fn() },
    person: { findFirst: jest.fn(), count: jest.fn() },
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
    db.person.count.mockResolvedValue(1);
  });

  it.each(["none", "AM", "A1", "A2", "A"] as const)(
    "quotes %s from licence policy despite a contradictory legacy category",
    async (requiredLicenseCategory) => {
      db.scooter.findFirst.mockResolvedValue({
        id: "scooter",
        requiredLicenseCategory,
        commercialCategory:
          requiredLicenseCategory === "none"
            ? "with_license"
            : "without_license",
      });
      const terms = await service.quote("agent", { scooterId: "scooter" });
      expect(terms.commercialCategory).toBe(
        requiredLicenseCategory === "none" ? "without_license" : "with_license",
      );
      expect(terms.weeklyRateMinor).toBe(
        requiredLicenseCategory === "none" ? 30000 : 25000,
      );
    },
  );

  it.each(["reserved", "active", "returned", "cancelled"])(
    "rejects 3+1 quotes and creation for a customer with a %s rental",
    async (status) => {
      db.rental.findFirst.mockResolvedValue({ id: "previous", status });
      const input = {
        scooterId: "scooter",
        personId: "person",
        promotion: "three_plus_one" as const,
        startsAt: now.toISOString(),
        endsAt: new Date(now.getTime() + 60_000).toISOString(),
      };
      const failure = {
        response: { code: v1.rentals.NEW_CUSTOMER_PROMOTION_ERROR_CODE },
      };
      await expect(service.quote("agent", input)).rejects.toMatchObject(
        failure,
      );
      await expect(service.create("agent", input)).rejects.toMatchObject(
        failure,
      );
      expect(db.rental.findFirst).toHaveBeenLastCalledWith({
        where: { personId: "person" },
        select: { id: true },
      });
      expect(db.$queryRaw).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('"Person"')]),
        "person",
      );
      expect(db.rental.create).not.toHaveBeenCalled();
    },
  );

  it("quotes 3+1 for a new customer and standard terms for a returning customer", async () => {
    const input = { scooterId: "scooter", personId: "person" };
    db.scooter.findFirst.mockResolvedValue({ requiredLicenseCategory: "none" });
    db.rental.findFirst.mockResolvedValue(null);
    await expect(
      service.quote("agent", { ...input, promotion: "three_plus_one" }),
    ).resolves.toMatchObject({
      promotion: "three_plus_one",
      initialCoverageDays: 28,
    });
    db.rental.findFirst.mockResolvedValue({ id: "previous" });
    await expect(
      service.quote("agent", { ...input, promotion: "standard" }),
    ).resolves.toMatchObject({ promotion: "standard", initialCoverageDays: 7 });
  });

  it("requires a selected customer for a 3+1 quote", async () => {
    await expect(
      service.quote("agent", {
        scooterId: "scooter",
        promotion: "three_plus_one",
      }),
    ).rejects.toMatchObject({
      response: { code: v1.rentals.NEW_CUSTOMER_PROMOTION_ERROR_CODE },
    });
  });

  it("requires client copies before creating a rental and accepts the initial CIV inspection", async () => {
    const documents = ["civ", "registration_certificate", "insurance"].map(
      (type) => ({
        id: type,
        type,
        extractedData: null,
        clientCopyAsset: { deletedAt: null },
        customerVisible: true,
        insurancePolicy:
          type === "insurance"
            ? {
                validFrom: new Date("2020-01-01"),
                validUntil: new Date("2099-01-01"),
              }
            : null,
      }),
    );
    const scooter = {
      id: "scooter",
      registrationType: "national",
      registrationNumber: "B123ABC",
      civDocument: { issuedAt: new Date() },
      inspections: [],
      documents,
      insurancePolicies: [
        {
          validFrom: new Date("2020-01-01"),
          validUntil: new Date("2099-01-01"),
        },
      ],
      requiredLicenseCategory: "none",
    };
    const input = {
      scooterId: "scooter",
      personId: "person",
      startsAt: now.toISOString(),
      endsAt: new Date(now.getTime() + 60_000).toISOString(),
    };
    db.scooter.findFirst.mockResolvedValue(scooter);
    const reachedCreate = new Error("Reached rental creation");
    db.rental.create.mockRejectedValue(reachedCreate);
    await expect(service.create("agent", input)).rejects.toBe(reachedCreate);
    expect(db.rental.create).toHaveBeenCalledTimes(1);
    db.rental.create.mockClear();
    db.scooter.findFirst.mockResolvedValue({
      ...scooter,
      documents: documents.map((document) => ({
        ...document,
        clientCopyAsset: null,
      })),
    });
    await expect(service.create("agent", input)).rejects.toMatchObject({
      response: {
        code: "SCOOTER_DOCUMENTS_REQUIRED",
        details: {
          missingClientDocuments: [
            "civ",
            "registration_certificate",
            "insurance",
          ],
        },
      },
    });
    expect(db.rental.create).not.toHaveBeenCalled();
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

  it("rejects rental creation while an open problem holds the scooter", async () => {
    db.scooterProblem.findFirst.mockResolvedValue({ id: "open-blocker" });
    await expect(
      service.create("agent", {
        scooterId: "scooter",
        personId: "person",
        startsAt: now.toISOString(),
        endsAt: new Date(now.getTime() + 60_000).toISOString(),
      }),
    ).rejects.toThrow("maintenance hold");
    expect(db.scooterProblem.findFirst).toHaveBeenCalledWith({
      where: {
        scooterId: "scooter",
        blocksUsage: true,
        status: { in: ["open", "in_progress"] },
      },
      select: { id: true },
    });
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.scooterProblem.findFirst.mock.invocationCallOrder[0],
    );
    expect(db.rental.create).not.toHaveBeenCalled();
  });

  it("rejects handover when a blocker was reported after reservation", async () => {
    db.scooterProblem.findFirst.mockResolvedValue({ id: "blocker" });
    db.rental.findUnique.mockResolvedValue({
      id: "rental",
      scooterId: "scooter",
      revision: 1,
      status: "reserved",
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 60_000),
      scooter: { deletedAt: null },
      person: { deletedAt: null },
    });
    await expect(
      service.transition("agent", "rental", 1, "handover"),
    ).rejects.toThrow("maintenance hold");
    expect(db.rental.update).not.toHaveBeenCalled();
  });
});
