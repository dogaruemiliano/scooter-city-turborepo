import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { readFileSync } from "node:fs";
import { Client } from "pg";
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
import { v1 } from "@repo/api-shared";
import { ProblemPhotosService } from "./problem-photos.service";
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
    "reporter",
  ].map((name) => `${prefix}-${name}`);
  const [admin, mechanicA, mechanicB, renterA, renterB, reporter] = userIds as [
    string,
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
    completePresignedUpload: jest.fn(),
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
    problems = new ProblemsService(
      db,
      access,
      audit,
      new ProblemPhotosService(db, storage as unknown as ImageStorageService),
    );
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
    await db.userPermissionOverride.createMany({
      data: [
        "problems.read",
        "problems.create",
        "problems.assign",
        "problems.update",
        "problems.reopen",
        "scooters.read",
      ].map((permissionKey) => ({
        userId: reporter,
        permissionKey,
        scopes: ["ALL"],
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
      db.scooterProblemPhoto.deleteMany({
        where: { problem: { scooterId: { in: scooterIds } } },
      }),
      db.draftUpload.deleteMany({ where: { userId: { in: userIds } } }),
      db.scooterProblem.deleteMany({
        where: { scooterId: { in: scooterIds } },
      }),
      db.rental.deleteMany({ where: { scooterId: { in: scooterIds } } }),
      db.scooterDocument.deleteMany({
        where: { scooterId: { in: scooterIds } },
      }),
      db.mediaAsset.deleteMany({
        where: {
          OR: [
            { id: `${prefix}-asset` },
            { storageKey: { startsWith: prefix } },
          ],
        },
      }),
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
    const created = await problems.create(
      admin,
      v1.problems.createProblemInputSchema.parse({
        scooterId: scooterIds[0],
        description: "Concurrent claim test",
        title: "Test report",
        severity: "moderate",
      }),
    );
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
    const own = await problems.create(
      admin,
      v1.problems.createProblemInputSchema.parse({
        scooterId: scooterIds[0],
        description: "Own",
        title: "Test report",
        severity: "moderate",
      }),
    );
    const other = await problems.create(
      admin,
      v1.problems.createProblemInputSchema.parse({
        scooterId: scooterIds[1],
        description: "Other",
        title: "Test report",
        severity: "moderate",
      }),
    );
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

  it("reports, assigns, finds assigned work, comments, progresses and resolves without a maintenance event", async () => {
    const created = await problems.create(
      reporter,
      v1.problems.createProblemInputSchema.parse({
        scooterId: scooterIds[0],
        title: "Broken belt",
        severity: "critical",
        blocksUsage: true,
        assigneeId: mechanicA,
      }),
    );
    expect(created.reporter?.id).toBe(reporter);
    const assigned = await problems.list(
      mechanicA,
      v1.problems.listProblemsQuerySchema.parse({
        view: "assigned",
        severity: "critical",
        scooterId: scooterIds[0],
        assigneeId: mechanicA,
      }),
    );
    expect(assigned.items.some((item) => item.id === created.id)).toBe(true);
    const started = await problems.update(mechanicA, created.id, {
      revision: created.revision,
      startWork: true,
    });
    const commented = await problems.comment(mechanicA, created.id, {
      revision: started.revision,
      body: "Belt replaced; inspecting drivetrain",
    });
    const resolved = await problems.resolve(mechanicA, created.id, {
      revision: commented.revision,
      resolutionNotes: "Replacement belt tested successfully",
      clearMaintenanceHold: true,
    });
    expect(resolved).toMatchObject({
      status: "resolved",
      blocksUsage: false,
      resolutionNotes: "Replacement belt tested successfully",
    });
    const history = await problems.activity(mechanicA, created.id, {
      page: 1,
      pageSize: 25,
    });
    expect(history.items.map((entry) => entry.type)).toEqual([
      "PROBLEM_RESOLVED",
      "PROBLEM_COMMENTED",
      "PROBLEM_UPDATED",
      "PROBLEM_CREATED",
    ]);
    expect(
      history.items.find((entry) => entry.type === "PROBLEM_COMMENTED"),
    ).toMatchObject({
      actor: { id: mechanicA },
      note: "Belt replaced; inspecting drivetrain",
    });
    const reopened = await problems.reopen(
      reporter,
      created.id,
      resolved.revision,
    );
    expect(reopened).toMatchObject({
      status: "open",
      blocksUsage: false,
      assigneeId: mechanicA,
      resolutionNotes: "Replacement belt tested successfully",
    });
    expect(
      (
        await problems.activity(mechanicA, created.id, {
          page: 1,
          pageSize: 25,
        })
      ).items.some(
        (entry) => entry.note === "Replacement belt tested successfully",
      ),
    ).toBe(true);
  });

  it("keeps independent blockers through resolve, dismiss, reopen and explicit clearance", async () => {
    const first = await problems.create(
      reporter,
      v1.problems.createProblemInputSchema.parse({
        scooterId: scooterIds[0],
        title: "Brake cable",
        severity: "high",
        blocksUsage: true,
      }),
    );
    const second = await problems.create(
      reporter,
      v1.problems.createProblemInputSchema.parse({
        scooterId: scooterIds[0],
        title: "Tyre inspection",
        severity: "moderate",
        blocksUsage: true,
      }),
    );
    const resolved = await problems.resolve(admin, first.id, {
      revision: first.revision,
      resolutionNotes: "Repaired, awaiting inspection",
      clearMaintenanceHold: false,
    });
    expect(
      (await problems.maintenanceHold(reporter, scooterIds[0])).count,
    ).toBe(2);
    await problems.cancel(reporter, second.id, second.revision, true);
    expect(
      (await problems.maintenanceHold(reporter, scooterIds[0])).blockers,
    ).toEqual([expect.objectContaining({ id: first.id, status: "resolved" })]);
    await expect(
      rentals.create(admin, {
        scooterId: scooterIds[0],
        personId: personIds[0],
        startsAt: new Date(Date.now() + 3_600_000).toISOString(),
        endsAt: new Date(Date.now() + 7_200_000).toISOString(),
      }),
    ).rejects.toThrow("maintenance hold");
    await problems.hold(reporter, first.id, {
      revision: resolved.revision,
      blocksUsage: false,
    });
    expect(
      (await problems.maintenanceHold(reporter, scooterIds[0])).onHold,
    ).toBe(false);
  });

  it("does not commit a problem update when required history recording fails", async () => {
    const created = await problems.create(
      reporter,
      v1.problems.createProblemInputSchema.parse({
        scooterId: scooterIds[0],
        title: "Audit rollback",
        severity: "low",
      }),
    );
    const failing = new ProblemsService(
      db,
      access,
      {
        recordRequired: () => Promise.reject(new Error("history unavailable")),
      } as unknown as AuditService,
      new ProblemPhotosService(db, storage as unknown as ImageStorageService),
    );
    await expect(
      failing.hold(reporter, created.id, {
        revision: created.revision,
        blocksUsage: true,
      }),
    ).rejects.toThrow("history unavailable");
    expect(
      await db.scooterProblem.findUnique({ where: { id: created.id } }),
    ).toMatchObject({ revision: created.revision, blocksUsage: false });
  });

  it("checks a concurrent blocker after waiting for the scooter lock", async () => {
    let release: () => void = () => undefined;
    let locked: () => void = () => undefined;
    const waitForLock = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const waitForRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${scooterIds[0]} FOR UPDATE`;
      await tx.scooterProblem.create({
        data: {
          scooterId: scooterIds[0],
          title: "Concurrent safety blocker",
          severity: "critical",
          reporterId: reporter,
          blocksUsage: true,
        },
      });
      locked();
      await waitForRelease;
    });
    await waitForLock;
    const attempt = rentals.create(admin, {
      scooterId: scooterIds[0],
      personId: personIds[0],
      startsAt: new Date(Date.now() + 10_800_000).toISOString(),
      endsAt: new Date(Date.now() + 14_400_000).toISOString(),
    });
    // Attach the rejection handler before releasing the transaction.
    const assertion = expect(attempt).rejects.toThrow("maintenance hold");
    release();
    await blocker;
    await assertion;
    await db.scooterProblem.updateMany({
      where: { scooterId: scooterIds[0], title: "Concurrent safety blocker" },
      data: { blocksUsage: false },
    });
  });

  it("claims a private photo atomically and cannot reuse or steal it", async () => {
    const stored = {
      provider: "s3",
      bucket: "private",
      storageKey: `${prefix}-photo`,
      contentType: "image/jpeg",
      byteSize: 30,
      checksumSha256: "a".repeat(64),
    };
    storage.completePresignedUpload.mockResolvedValue(stored);
    await db.draftUpload.create({
      data: {
        ...stored,
        userId: reporter,
        purpose: "problem-photo-draft",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const input = v1.problems.createProblemInputSchema.parse({
      scooterId: scooterIds[0],
      title: "Photo evidence",
      severity: "high",
      photos: [{ fileName: "brake.jpg", uploadToken: "test-token" }],
    });
    const created = await problems.create(reporter, input);
    expect(created.photos).toHaveLength(1);
    expect(created.photos[0].contentUrl).toContain(
      `/problems/${created.id}/photos/`,
    );
    const photo = await db.scooterProblemPhoto.findUniqueOrThrow({
      where: { id: created.photos[0].id },
      include: { asset: true },
    });
    expect(photo.asset.uploadedByUserId).toBe(reporter);
    await expect(problems.create(reporter, input)).rejects.toThrow(
      "already used",
    );
    const unclaimed = { ...stored, storageKey: `${prefix}-unclaimed-photo` };
    storage.completePresignedUpload.mockResolvedValue(unclaimed);
    await db.draftUpload.create({
      data: {
        ...unclaimed,
        userId: mechanicB,
        purpose: "problem-photo-draft",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expect(problems.create(reporter, input)).rejects.toThrow(
      "already used",
    );
    expect(
      await db.draftUpload.findUnique({
        where: { storageKey: unclaimed.storageKey },
      }),
    ).toMatchObject({ claimedAt: null });
  });

  it("backfills legacy titles without inventing severity or losing description and resolution", async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query('CREATE SCHEMA "problem_release_migration_test"');
      await client.query(
        'SET LOCAL search_path TO "problem_release_migration_test"',
      );
      await client.query(
        'CREATE TABLE "ScooterProblem" (id TEXT PRIMARY KEY, "scooterId" TEXT, description TEXT NOT NULL, priority TEXT, status TEXT, "resolutionNotes" TEXT); CREATE TABLE "MediaAsset" (id TEXT PRIMARY KEY)',
      );
      const description = "Legacy brake report ".repeat(20);
      await client.query(
        'INSERT INTO "ScooterProblem" (id, description, priority, status, "resolutionNotes") VALUES ($1, $2, $3, $4, $5)',
        ["legacy", description, "urgent", "resolved", "Original resolution"],
      );
      await client.query(
        readFileSync(
          "prisma/migrations/20261014150000_problem_reporting_release/migration.sql",
          "utf8",
        ),
      );
      const migrated = await client.query(
        'SELECT * FROM "ScooterProblem" WHERE id = $1',
        ["legacy"],
      );
      expect(migrated.rows[0]).toMatchObject({
        title: description.trim().slice(0, 160),
        description,
        priority: "urgent",
        severity: null,
        blocksUsage: false,
        status: "resolved",
        resolutionNotes: "Original resolution",
      });
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
