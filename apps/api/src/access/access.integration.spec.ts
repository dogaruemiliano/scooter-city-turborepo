import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma/runtime";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { v1 } from "@repo/api-shared";
import { randomUUID } from "node:crypto";
import type { Logger } from "nestjs-pino";
import { AuditService } from "../audit/audit.service";
import { CoreAuthService } from "../auth/modules/core-auth/core-auth.service";
import { OAuthAccountResolver } from "../auth/modules/core-auth/oauth-account-resolver.service";
import { OtpChallengeService } from "../auth/modules/otp-challenge/otp-challenge.service";
import type { OtpDeliveryQuotaService } from "../auth/modules/otp-challenge/otp-delivery-quota.service";
import type { KeyRing } from "../auth/utils/keys";
import type { Env } from "../config/env";
import { SpyMailerService } from "../mailer/impls/spy-mailer.service";
import type { MailerService } from "../mailer/mailer.service";
import { PrismaService } from "../prisma/prisma.service";
import { accessibleWhere, createAbility } from "./access.ability";
import { AccessService } from "./access.service";

const databaseUrl = process.env.ACCESS_INTEGRATION_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("Live access service against PostgreSQL", () => {
  let db: PrismaService;
  let access: AccessService;
  let audit: AuditService;
  const prefix = `access-${randomUUID()}`;
  const users = ["admin-a", "admin-b", "worker", "direct"].map(
    (id) => `${prefix}-${id}`,
  );
  const [adminA, adminB, worker, direct] = users as [
    string,
    string,
    string,
    string,
  ];
  const roleIds: string[] = [];
  let assignedRole: v1.access.Role;
  let availableRole: v1.access.Role;
  const scooterId = `${prefix}-scooter`;
  const problemIds = ["assigned", "available", "other", "closed"].map(
    (id) => `${prefix}-${id}`,
  );
  const env = {
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
    AUTH_EMAIL_OTP_ENABLED: true,
  } as Env;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !url.pathname.startsWith("/scooter_access_test_authz_")
    )
      throw new Error("Use an isolated local authz-test database");
    db = new PrismaService(env);
    await db.$connect();
    if (await db.user.count())
      throw new Error("Last-admin tests require an empty dedicated database");
    audit = new AuditService(db, {
      error: () => undefined,
    } as unknown as Logger);
    access = new AccessService(db, audit, {} as MailerService, env);
    await db.user.createMany({
      data: users.map((id) => ({
        id,
        email: `${id}@example.test`,
        loginStatus: "ACTIVE" as const,
        isSuperAdmin: id === adminA || id === adminB,
      })),
    });
    assignedRole = await access.createRole(adminA, {
      slug: `${prefix}-assigned`,
      name: "Assigned",
      description: "",
      permissions: [{ permissionKey: "problems.read", scopes: ["ASSIGNED"] }],
    });
    roleIds.push(assignedRole.id);
    availableRole = await access.createRole(adminA, {
      slug: `${prefix}-available`,
      name: "Available",
      description: "",
      permissions: [{ permissionKey: "problems.read", scopes: ["AVAILABLE"] }],
    });
    roleIds.push(availableRole.id);
    await db.scooterBrand.create({
      data: {
        id: `${prefix}-brand`,
        name: `${prefix}-brand`,
        code: randomUUID().slice(0, 8),
      },
    });
    await db.scooter.create({
      data: {
        id: scooterId,
        fleetNumber: 1,
        brandId: `${prefix}-brand`,
        vin: randomUUID().replaceAll("-", "").slice(0, 17),
        powertrainType: "electric",
      },
    });
    await db.scooterProblem.createMany({
      data: problemIds.map((id, index) => ({
        id,
        scooterId,
        title: id,
        description: id,
        reporterId: adminA,
        assigneeId: index === 0 ? worker : index === 2 ? direct : null,
        status: index === 3 ? "resolved" : "open",
      })),
    });
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    const persistedRoles = await db.role.findMany({
      where: { slug: { startsWith: prefix } },
      select: { id: true },
    });
    const cleanupRoleIds = persistedRoles.map((role) => role.id);
    await db.$transaction([
      db.auditEvent.deleteMany({ where: { userId: { in: users } } }),
      db.scooterProblem.deleteMany({ where: { id: { in: problemIds } } }),
      db.scooter.deleteMany({ where: { id: scooterId } }),
      db.scooterBrand.deleteMany({ where: { id: `${prefix}-brand` } }),
      db.userRole.deleteMany({ where: { userId: { in: users } } }),
      db.userPermissionOverride.deleteMany({
        where: { userId: { in: users } },
      }),
      db.userInvitation.deleteMany({ where: { userId: { in: users } } }),
      db.otpChallenge.deleteMany({ where: { userId: { in: users } } }),
      db.rolePermission.deleteMany({
        where: { roleId: { in: cleanupRoleIds } },
      }),
      db.role.deleteMany({ where: { id: { in: cleanupRoleIds } } }),
      db.user.deleteMany({ where: { id: { in: users } } }),
    ]);
    await db.$disconnect();
  }, 30_000);

  async function replace(overrides: v1.access.UserAccessInput["overrides"]) {
    const user = await access.getUser(worker);
    return access.updateAccess(adminA, worker, {
      expectedRevision: user.accessRevision,
      roles: user.roles.map((role) => ({
        id: role.id,
        revision: role.revision,
      })),
      overrides,
    });
  }

  it.each(["otp", "existing-oauth", "new-oauth"])(
    "does not issue stale %s proof when suspension wins the lifecycle lock",
    async (method) => {
      const id = `${prefix}-${method}-race`;
      users.push(id);
      const email = `${id}@example.test`;
      await db.user.create({ data: { id, email, loginStatus: "ACTIVE" } });
      if (method === "existing-oauth") {
        await db.authAccount.create({
          data: { provider: "google", providerId: id, userId: id, email },
        });
      }
      const resolver = new OAuthAccountResolver(
        db,
        new CoreAuthService(db, {} as JwtService, env, {} as KeyRing),
      );
      const mailer = new SpyMailerService();
      const otp = new OtpChallengeService(
        db,
        mailer,
        {
          reserve: jest.fn().mockResolvedValue([]),
        } as unknown as OtpDeliveryQuotaService,
        { ...env, OTP_TTL: "10m", OTP_HMAC_SECRET: "otp-race-test-secret" },
      );
      let release!: () => void;
      let locked!: () => void;
      const ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const suspension = db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(726001)`;
        await tx.user.update({
          where: { id },
          data: { loginStatus: "SUSPENDED", accessRevision: { increment: 1 } },
        });
        await tx.otpChallenge.updateMany({
          where: { userId: id, usedAt: null },
          data: { usedAt: new Date(), activeKey: null },
        });
        locked();
        await barrier;
      });
      await ready;
      const reservation =
        method === "otp"
          ? otp.createOrReuse({
              purpose: "AUTH",
              target: email,
              ip: null,
            })
          : resolver.resolve({
              provider: "google",
              providerId: id,
              email,
              emailVerified: true,
              firstName: null,
              lastName: null,
              existingEmailPolicy: "preserve",
            });
      // Ensure the SERIALIZABLE reservation has started before committing suspension.
      try {
        let waiting = false;
        for (let attempt = 0; attempt < 50; attempt += 1) {
          const rows = await db.$queryRaw<{ count: number }[]>`
          SELECT count(*)::int AS count FROM pg_locks
          WHERE locktype = 'advisory' AND objid = 726001 AND NOT granted`;
          if (rows[0].count > 0) {
            waiting = true;
            break;
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
      } finally {
        release();
      }
      await suspension;
      if (method === "otp") {
        await expect(reservation).resolves.toMatchObject({
          status: "verification_required",
        });
      } else {
        await expect(reservation).rejects.toBeInstanceOf(UnauthorizedException);
      }
      expect(await db.otpChallenge.count({ where: { userId: id } })).toBe(0);
      expect(await db.session.count({ where: { userId: id } })).toBe(0);
      expect(await db.authAccount.count({ where: { userId: id } })).toBe(
        method === "existing-oauth" ? 1 : 0,
      );
      expect(mailer.getOutbox()).toHaveLength(0);
    },
  );

  it("unions live roles and uses replacement scopes including empty and reset", async () => {
    await access.updateAccess(adminA, worker, {
      expectedRevision: 1,
      roles: [
        { id: assignedRole.id, revision: 1 },
        { id: availableRole.id, revision: 1 },
      ],
      overrides: [],
    });
    expect(
      (await access.getSnapshot(worker)).effectiveScopes["problems.read"],
    ).toEqual(["ASSIGNED", "AVAILABLE"]);
    await replace([{ permissionKey: "problems.read", scopes: ["ALL"] }]);
    expect(
      (await access.getSnapshot(worker)).effectiveScopes["problems.read"],
    ).toEqual(["ALL"]);
    await replace([{ permissionKey: "problems.read", scopes: ["ASSIGNED"] }]);
    expect(
      (await access.getSnapshot(worker)).effectiveScopes["problems.read"],
    ).toEqual(["ASSIGNED"]);
    await replace([{ permissionKey: "problems.read", scopes: [] }]);
    expect(
      (await access.getSnapshot(worker)).effectiveScopes["problems.read"],
    ).toEqual([]);
    await replace([]);
    expect(
      (await access.getSnapshot(worker)).effectiveScopes["problems.read"],
    ).toEqual(["ASSIGNED", "AVAILABLE"]);
    const directUser = await access.updateAccess(adminA, direct, {
      expectedRevision: 1,
      roles: [],
      overrides: [{ permissionKey: "problems.read", scopes: ["ALL"] }],
    });
    expect(directUser.roles).toEqual([]);
    expect(
      (await access.getSnapshot(direct)).effectiveScopes["problems.read"],
    ).toEqual(["ALL"]);
  });

  it("keeps query/object authorization equivalent for assigned and available scopes", async () => {
    const snapshot = await access.getSnapshot(worker);
    const ability = createAbility(snapshot);
    const rows = await db.scooterProblem.findMany({ orderBy: { id: "asc" } });
    const authorizedIds = rows
      .filter((row) =>
        ability.can("problems.read", subject("ScooterProblem", row)),
      )
      .map((row) => row.id);
    const fromQuery = await db.scooterProblem.findMany({
      where: accessibleWhere(snapshot, "problems.read", "ScooterProblem"),
      orderBy: { id: "asc" },
      select: { id: true },
    });
    expect(fromQuery.map((row) => row.id)).toEqual(authorizedIds);
    expect(authorizedIds.sort()).toEqual([problemIds[0], problemIds[1]].sort());
  });

  it("CASL extension returns no records for absent grants on normal and transaction clients", async () => {
    const user = await access.getUser(direct);
    await access.updateAccess(adminA, direct, {
      expectedRevision: user.accessRevision,
      roles: [],
      overrides: [],
    });
    const snapshot = await access.getSnapshot(direct);
    expect(() =>
      accessibleWhere(snapshot, "problems.read", "ScooterProblem"),
    ).toThrow(ForbiddenException);
    const where = accessibleBy(createAbility(snapshot), "problems.read").ofType(
      "ScooterProblem",
    );
    await expect(
      db.authorized.scooterProblem.findMany({ where }),
    ).resolves.toEqual([]);
    await expect(
      db.authorized.$transaction((tx) => tx.scooterProblem.findMany({ where })),
    ).resolves.toEqual([]);
    await expect(
      db.authorized.scooterProblem.updateMany({
        where,
        data: { description: "must not happen" },
      }),
    ).resolves.toEqual({ count: 0 });
    expect(
      await db.scooterProblem.count({
        where: { description: "must not happen" },
      }),
    ).toBe(0);
  });

  it("role edits affect members immediately and reject stale role/user revisions", async () => {
    const before = await access.getSnapshot(worker);
    assignedRole = await access.updateRole(adminA, assignedRole.id, {
      expectedRevision: 1,
      name: "Assigned or all",
      description: "",
      permissions: [{ permissionKey: "problems.read", scopes: ["ALL"] }],
    });
    const after = await access.getSnapshot(worker);
    expect(after.effectiveScopes["problems.read"]).toEqual(["ALL"]);
    expect(after.accessRevision).toBe(before.accessRevision);
    expect(after.roleVersions).not.toEqual(before.roleVersions);
    await expect(
      access.updateAccess(adminA, worker, {
        expectedRevision: before.accessRevision,
        roles: [{ id: assignedRole.id, revision: 1 }],
        overrides: [],
      }),
    ).rejects.toThrow(ConflictException);
    await expect(
      access.updateAccess(adminA, worker, {
        expectedRevision: 1,
        roles: [],
        overrides: [],
      }),
    ).rejects.toThrow(ConflictException);
    const changes = await Promise.allSettled([
      access.updateRole(adminA, availableRole.id, {
        expectedRevision: 1,
        name: "One",
        description: "",
        permissions: [],
      }),
      access.updateRole(adminB, availableRole.id, {
        expectedRevision: 1,
        name: "Two",
        description: "",
        permissions: [],
      }),
    ]);
    expect(
      changes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      changes.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });

  it("assignment and archival serialize so no archived role can acquire members", async () => {
    const role = await access.createRole(adminA, {
      slug: `${prefix}-race`,
      name: "Race",
      description: "",
      permissions: [],
    });
    roleIds.push(role.id);
    const user = await access.getUser(direct);
    const results = await Promise.allSettled([
      access.updateAccess(adminA, direct, {
        expectedRevision: user.accessRevision,
        roles: [{ id: role.id, revision: role.revision }],
        overrides: [],
      }),
      access.archiveRole(adminB, role.id, role.revision),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const final = await access.getRole(role.id);
    expect(final.archivedAt !== null && final.memberCount > 0).toBe(false);
  });

  it("audit failure rolls back the whole access replacement", async () => {
    const before = await access.getUser(worker);
    const failingAudit = {
      recordRequired: () => Promise.reject(new Error("audit unavailable")),
    } as unknown as AuditService;
    const failing = new AccessService(
      db,
      failingAudit,
      {} as MailerService,
      env,
    );
    await expect(
      failing.updateAccess(adminA, worker, {
        expectedRevision: before.accessRevision,
        roles: [],
        overrides: [],
      }),
    ).rejects.toThrow("audit unavailable");
    expect(await access.getUser(worker)).toEqual(before);
  });

  it("corrupt grants and corrupt restrictions fail closed without restoring inheritance", async () => {
    await db.rolePermission.create({
      data: {
        roleId: assignedRole.id,
        permissionKey: "unknown.access",
        scopes: ["ALL"],
      },
    });
    await db.userPermissionOverride.create({
      data: { userId: worker, permissionKey: "problems.read", scopes: ["OWN"] },
    });
    const snapshot = await access.getSnapshot(worker);
    expect(snapshot.effectiveScopes["unknown.access"]).toBeUndefined();
    expect(snapshot.effectiveScopes["problems.read"]).toEqual([]);
    const repairable = await access.getUser(worker);
    expect(repairable.overrides).toContainEqual({
      permissionKey: "problems.read",
      scopes: [],
      reason: null,
    });
    expect(
      (await access.getRole(assignedRole.id)).permissions.some(
        (grant) => (grant.permissionKey as string) === "unknown.access",
      ),
    ).toBe(false);
    expect(() =>
      accessibleWhere(snapshot, "problems.read", "ScooterProblem"),
    ).toThrow(ForbiddenException);
    await db.rolePermission.delete({
      where: {
        roleId_permissionKey: {
          roleId: assignedRole.id,
          permissionKey: "unknown.access",
        },
      },
    });
    await db.userPermissionOverride.delete({
      where: {
        userId_permissionKey: {
          userId: worker,
          permissionKey: "problems.read",
        },
      },
    });
  });

  it("rejects claim configurations that cannot read and work assigned problems", async () => {
    const user = await access.getUser(direct);
    await expect(
      access.updateAccess(adminA, direct, {
        expectedRevision: user.accessRevision,
        roles: [],
        overrides: [
          { permissionKey: "problems.read", scopes: ["AVAILABLE"] },
          { permissionKey: "problems.claim", scopes: ["AVAILABLE"] },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect((await access.getUser(direct)).accessRevision).toBe(
      user.accessRevision,
    );
  });

  it("nested customer document predicates agree in JavaScript and SQL, including expiry", async () => {
    const personId = `${prefix}-person`,
      rentalId = `${prefix}-rental`,
      assetId = `${prefix}-asset`,
      docId = `${prefix}-document`;
    const now = new Date();
    try {
      await db.person.create({
        data: {
          id: personId,
          userId: worker,
          email: `${personId}@example.test`,
          firstName: "Worker",
          lastName: "Renter",
          phone: personId,
          customerAccessEnabled: true,
        },
      });
      await db.rental.create({
        data: {
          id: rentalId,
          personId,
          scooterId,
          createdByUserId: adminA,
          status: "active",
          startsAt: new Date(now.getTime() - 120_000),
          endsAt: new Date(now.getTime() + 120_000),
          handedOverAt: now,
        },
      });
      await db.mediaAsset.create({
        data: {
          id: assetId,
          provider: "s3",
          bucket: "test",
          storageKey: assetId,
          contentType: "application/pdf",
          byteSize: 1,
          checksumSha256: "a".repeat(64),
        },
      });
      await db.scooterDocument.create({
        data: {
          id: docId,
          scooterId,
          assetId,
          type: "registration_certificate",
          fileName: "registration.pdf",
          customerVisible: true,
        },
      });
      await replace([
        { permissionKey: "portal.profile.read", scopes: ["OWN"] },
        { permissionKey: "portal.rentals.read", scopes: ["OWN"] },
        { permissionKey: "portal.scooter_documents.read", scopes: ["OWN"] },
      ]);
      const snapshot = await access.getSnapshot(worker);
      const ability = createAbility(snapshot, now);
      const query = accessibleBy(
        ability,
        "portal.scooter_documents.read",
      ).ofType("ScooterDocument");
      const read = () =>
        db.scooterDocument.findUniqueOrThrow({
          where: { id: docId },
          include: {
            asset: true,
            scooter: {
              include: {
                rentals: { include: { person: { include: { user: true } } } },
              },
            },
          },
        });
      expect(
        ability.can(
          "portal.scooter_documents.read",
          subject("ScooterDocument", await read()),
        ),
      ).toBe(true);
      expect(await db.scooterDocument.count({ where: query })).toBe(1);
      await db.rental.update({
        where: { id: rentalId },
        data: { endsAt: new Date(now.getTime() - 1) },
      });
      expect(
        ability.can(
          "portal.scooter_documents.read",
          subject("ScooterDocument", await read()),
        ),
      ).toBe(false);
      expect(await db.scooterDocument.count({ where: query })).toBe(0);
    } finally {
      await db.$transaction([
        db.scooterDocument.deleteMany({ where: { id: docId } }),
        db.mediaAsset.deleteMany({ where: { id: assetId } }),
        db.rental.deleteMany({ where: { id: rentalId } }),
        db.person.deleteMany({ where: { id: personId } }),
      ]);
    }
  });

  it("invitation notifications point to the actual sign-in page", async () => {
    const mailer = { send: jest.fn().mockResolvedValue(undefined) };
    const inviting = new AccessService(db, audit, mailer, {
      ...env,
      APP_BASE_URL: "https://scooter.example",
    });
    const user = await inviting.createUser(adminA, {
      email: `${prefix}-invited@example.test`,
      roles: [],
      overrides: [],
    });
    users.push(user.id);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          "https://scooter.example/sign-in",
        ) as string,
      }),
    );
    expect(user.invitation?.deliveryStatus).toBe("SENT");
    expect(user.loginStatus).toBe("INVITED");
  });

  it("concurrent self-demotions leave exactly one active super admin", async () => {
    const a = await access.getUser(adminA),
      b = await access.getUser(adminB);
    const results = await Promise.allSettled([
      access.setSuperAdmin(adminA, adminA, {
        expectedRevision: a.accessRevision,
        isSuperAdmin: false,
      }),
      access.setSuperAdmin(adminB, adminB, {
        expectedRevision: b.accessRevision,
        isSuperAdmin: false,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const remaining = await db.user.findFirstOrThrow({
      where: { isSuperAdmin: true, loginStatus: "ACTIVE", deletedAt: null },
    });
    expect(
      await db.user.count({
        where: { isSuperAdmin: true, loginStatus: "ACTIVE", deletedAt: null },
      }),
    ).toBe(1);
    await expect(
      access.setStatus(remaining.id, remaining.id, {
        expectedRevision: remaining.accessRevision,
        status: "SUSPENDED",
      }),
    ).rejects.toThrow(ConflictException);
  });
});
