import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { Logger } from "nestjs-pino";
import { AccessService } from "../access/access.service";
import { accessibleWhere } from "../access/access.ability";
import { AuditService } from "../audit/audit.service";
import type { Env } from "../config/env";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { MailerService } from "../mailer/mailer.service";
import { PortalService } from "../portal/portal.service";
import { PrismaService } from "../prisma/prisma.service";
import { RentalsService } from "../rentals/rentals.service";
import { ProblemsService } from "./problems.service";

// Opt-in only: these tests create and remove their own fixtures in a disposable database.
const databaseUrl = process.env.ACCESS_DOMAIN_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("Access domains against PostgreSQL", () => {
  let db: PrismaService;
  let access: AccessService;
  let problems: ProblemsService;
  let rentals: RentalsService;
  let portal: PortalService;
  const prefix = `domain-${randomUUID()}`;
  const userIds = [
    "admin",
    "mechanic-a",
    "mechanic-b",
    "renter-a",
    "renter-b",
  ].map((name) => `${prefix}-${name}`);
  const [admin, mechanicA, mechanicB, renterA, renterB] = userIds as [
    string,
    string,
    string,
    string,
    string,
  ];
  const roleIds = [`${prefix}-mechanic`, `${prefix}-customer`];
  const scooterIds = [`${prefix}-scooter-a`, `${prefix}-scooter-b`];
  const personIds = [`${prefix}-person-a`, `${prefix}-person-b`];
  const documentId = `${prefix}-document`;
  let activeRentalId: string;
  const storage = {
    readDocument: jest.fn().mockImplementation(() =>
      Promise.resolve({
        body: Readable.from(["test document"]),
        contentType: "application/pdf",
        contentLength: 13,
      }),
    ),
  };

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !url.pathname.startsWith("/scooter_access_test_")
    )
      throw new Error(
        "Use an explicitly named local disposable access-test database",
      );
    db = new PrismaService({
      DATABASE_URL: databaseUrl,
      NODE_ENV: "test",
    } as Env);
    await db.$connect();
    const audit = new AuditService(db, {
      error: () => undefined,
    } as unknown as Logger);
    access = new AccessService(db, audit, {} as MailerService, {} as Env);
    problems = new ProblemsService(db, access, audit);
    rentals = new RentalsService(db, access, audit);
    portal = new PortalService(
      db,
      access,
      storage as unknown as ImageStorageService,
    );
    await db.user.createMany({
      data: userIds.map((id) => ({
        id,
        email: `${id}@example.test`,
        loginStatus: "ACTIVE" as const,
        isSuperAdmin: id === admin,
      })),
    });
    await db.role.create({
      data: {
        id: roleIds[0],
        slug: `${prefix}-mechanic`,
        name: `${prefix} mechanic`,
        permissions: {
          create: [
            {
              permissionKey: "problems.read",
              scopes: ["ASSIGNED", "AVAILABLE"],
            },
            { permissionKey: "problems.update", scopes: ["ASSIGNED"] },
            { permissionKey: "problems.resolve", scopes: ["ASSIGNED"] },
            { permissionKey: "problems.claim", scopes: ["AVAILABLE"] },
            { permissionKey: "scooters.read", scopes: ["ASSIGNED"] },
          ],
        },
        members: { create: [{ userId: mechanicA }, { userId: mechanicB }] },
      },
    });
    await db.role.create({
      data: {
        id: roleIds[1],
        slug: `${prefix}-customer`,
        name: `${prefix} customer`,
        permissions: {
          create: [
            { permissionKey: "portal.profile.read", scopes: ["OWN"] },
            { permissionKey: "portal.rentals.read", scopes: ["OWN"] },
            { permissionKey: "portal.scooter_documents.read", scopes: ["OWN"] },
          ],
        },
        members: { create: [{ userId: renterA }, { userId: renterB }] },
      },
    });
    const brand = await db.scooterBrand.create({
      data: {
        id: `${prefix}-brand`,
        name: `${prefix} brand`,
        code: randomUUID().slice(0, 8),
      },
    });
    const number = 1_000_000_000 + Math.floor(Math.random() * 500_000_000);
    await db.scooter.createMany({
      data: scooterIds.map((id, index) => ({
        id,
        fleetNumber: number + index,
        vin: randomUUID().replaceAll("-", "").slice(0, 17).toUpperCase(),
        brandId: brand.id,
        powertrainType: "electric" as const,
      })),
    });
    await db.person.createMany({
      data: personIds.map((id, index) => ({
        id,
        userId: index === 0 ? renterA : renterB,
        email: `${id}@example.test`,
        firstName: "Test",
        lastName: `Renter ${index}`,
        phone: `${prefix}-${index}`,
        customerAccessEnabled: true,
      })),
    });
    const asset = await db.mediaAsset.create({
      data: {
        id: `${prefix}-asset`,
        provider: "s3",
        bucket: "private-test",
        storageKey: `${prefix}/registration.pdf`,
        contentType: "application/pdf",
        byteSize: 13,
        checksumSha256: "a".repeat(64),
      },
    });
    await db.scooterDocument.create({
      data: {
        id: documentId,
        scooterId: scooterIds[0],
        type: "registration_certificate",
        fileName: "registration.pdf",
        assetId: asset.id,
      },
    });
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.$transaction([
      db.auditEvent.deleteMany({ where: { userId: { in: userIds } } }),
      db.scooterProblem.deleteMany({
        where: { scooterId: { in: scooterIds } },
      }),
      db.rental.deleteMany({ where: { scooterId: { in: scooterIds } } }),
      db.scooterDocument.deleteMany({
        where: { scooterId: { in: scooterIds } },
      }),
      db.mediaAsset.deleteMany({ where: { id: `${prefix}-asset` } }),
      db.person.deleteMany({ where: { id: { in: personIds } } }),
      db.scooter.deleteMany({ where: { id: { in: scooterIds } } }),
      db.scooterBrand.deleteMany({ where: { id: `${prefix}-brand` } }),
      db.userRole.deleteMany({ where: { userId: { in: userIds } } }),
      db.userPermissionOverride.deleteMany({
        where: { userId: { in: userIds } },
      }),
      db.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } }),
      db.role.deleteMany({ where: { id: { in: roleIds } } }),
      db.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    await db.$disconnect();
  }, 30_000);

  it("allows exactly one concurrent claim and denies the former assignee after reassignment", async () => {
    const created = await problems.create(admin, {
      scooterId: scooterIds[0],
      description: "Concurrent claim test",
    });
    const results = await Promise.allSettled([
      problems.claim(mechanicA, created.id, created.revision),
      problems.claim(mechanicB, created.id, created.revision),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failure = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(ConflictException);
    const claimed = await db.scooterProblem.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(
      await db.auditEvent.count({
        where: { targetId: created.id, type: "PROBLEM_CLAIMED" },
      }),
    ).toBe(1);
    const previous = claimed.assigneeId!;
    const next = previous === mechanicA ? mechanicB : mechanicA;
    const reassigned = await problems.assign(admin, created.id, {
      revision: claimed.revision,
      assigneeId: next,
    });
    await expect(
      problems.resolve(previous, created.id, {
        revision: reassigned.revision,
        resolutionNotes: "Forbidden old assignee",
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      problems.resolve(next, created.id, {
        revision: reassigned.revision,
        resolutionNotes: "Fixed",
      }),
    ).resolves.toMatchObject({ status: "resolved" });
  });

  it("applies identical CASL scopes in normal and transaction queries", async () => {
    const own = await problems.create(admin, {
      scooterId: scooterIds[0],
      description: "Own",
    });
    const other = await problems.create(admin, {
      scooterId: scooterIds[1],
      description: "Other",
    });
    await problems.assign(admin, own.id, {
      revision: 1,
      assigneeId: mechanicA,
    });
    await problems.assign(admin, other.id, {
      revision: 1,
      assigneeId: mechanicB,
    });
    const snapshot = await access.getSnapshot(mechanicA);
    const where = {
      AND: [
        accessibleWhere(snapshot, "problems.update", "ScooterProblem"),
        { id: { in: [own.id, other.id] } },
      ],
    };
    const direct = await db.scooterProblem.findMany({
      where,
      select: { id: true },
    });
    const transactional = await db.$transaction((tx) =>
      tx.scooterProblem.findMany({ where, select: { id: true } }),
    );
    expect(direct).toEqual([{ id: own.id }]);
    expect(transactional).toEqual(direct);
    await expect(problems.get(mechanicA, other.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(problems.scooter(mechanicA, scooterIds[1])).rejects.toThrow(
      NotFoundException,
    );
  });

  it("serializes competing rental reservations for the same scooter", async () => {
    const now = Date.now();
    const input = {
      scooterId: scooterIds[0],
      personId: personIds[0],
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
      customerNotes: "Visible",
      internalNotes: "Never expose",
    };
    const results = await Promise.allSettled([
      rentals.create(admin, input),
      rentals.create(admin, input),
    ]);
    const successes = results.filter((result) => result.status === "fulfilled");
    expect(successes).toHaveLength(1);
    const created = successes[0].value;
    activeRentalId = created.id;
    await rentals.transition(admin, created.id, created.revision, "handover");
  });

  it("isolates renter lists and direct IDs and streams only published scooter documents", async () => {
    const own = await portal.rental(renterA, activeRentalId);
    expect(own.customerNotes).toBe("Visible");
    expect(own).not.toHaveProperty("internalNotes");
    await expect(portal.rental(renterB, activeRentalId)).rejects.toThrow(
      NotFoundException,
    );
    const list = await portal.rentals(renterB, { page: 1, pageSize: 25 });
    expect(list.items).toEqual([]);
    expect(list.total).toBe(0);
    expect(
      (await portal.documents(renterA, activeRentalId)).items,
    ).toHaveLength(0);
    await expect(
      portal.content(renterA, activeRentalId, documentId),
    ).rejects.toThrow(NotFoundException);
    await rentals.visibility(admin, documentId, true);
    expect(
      (await portal.documents(renterA, activeRentalId)).items,
    ).toHaveLength(1);
    expect(
      (await portal.content(renterA, activeRentalId, documentId)).contentType,
    ).toBe("application/pdf");
    await expect(
      portal.content(renterB, activeRentalId, documentId),
    ).rejects.toThrow(NotFoundException);
    await rentals.visibility(admin, documentId, false);
    await expect(
      portal.content(renterA, activeRentalId, documentId),
    ).rejects.toThrow(NotFoundException);
  });

  it("customer revocation defeats multiple grants while preserving staff capability", async () => {
    await db.userPermissionOverride.createMany({
      data: [
        {
          userId: renterA,
          permissionKey: "portal.rentals.read",
          scopes: ["OWN"],
        },
        { userId: renterA, permissionKey: "scooters.read", scopes: ["ALL"] },
      ],
    });
    await db.person.update({
      where: { id: personIds[0] },
      data: { customerAccessEnabled: false },
    });
    await expect(portal.rental(renterA, activeRentalId)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(portal.documents(renterA, activeRentalId)).rejects.toThrow(
      ForbiddenException,
    );
    expect(
      (await access.getSnapshot(renterA)).effectiveScopes["scooters.read"],
    ).toEqual(["ALL"]);
    await db.person.update({
      where: { id: personIds[0] },
      data: { customerAccessEnabled: true },
    });
  });

  it("return immediately removes current-document access but preserves rental history", async () => {
    await rentals.visibility(admin, documentId, true);
    const current = await rentals.get(admin, activeRentalId);
    await rentals.transition(admin, activeRentalId, current.revision, "return");
    expect((await portal.rental(renterA, activeRentalId)).status).toBe(
      "returned",
    );
    await expect(
      portal.content(renterA, activeRentalId, documentId),
    ).rejects.toThrow(NotFoundException);
  });
});
