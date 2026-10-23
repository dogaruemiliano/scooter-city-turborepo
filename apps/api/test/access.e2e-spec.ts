import {
  INestApplication,
  RequestMethod,
  Type,
  VersioningType,
} from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import request from "supertest";

import {
  AccessRolesController,
  AccessUsersController,
  PersonAccessController,
} from "../src/access/access.controller";
import { AccessService } from "../src/access/access.service";
import {
  ACCESS_POLICY,
  type AccessPolicy,
} from "../src/access/access.decorators";
import { AppModule } from "../src/app.module";
import { CoreAuthService } from "../src/auth/modules/core-auth/core-auth.service";
import { FinanceController } from "../src/finance/http/finance.controller";
import { SpyMailerService } from "../src/mailer/impls/spy-mailer.service";
import { MailerService } from "../src/mailer/mailer.service";
import { PersonsController } from "../src/persons/persons.controller";
import { PortalController } from "../src/portal/portal.controller";
import { PrismaService } from "../src/prisma/prisma.service";
import { ProblemsController } from "../src/problems/problems.controller";
import { RentalsController } from "../src/rentals/rentals.controller";
import { ScooterBrandsController } from "../src/scooter-brands/scooter-brands.controller";
import { CivVocabularyController } from "../src/scooters/civ-vocabulary.controller";
import { ScooterDocumentsController } from "../src/scooters/scooter-documents.controller";
import { ScootersController } from "../src/scooters/scooters.controller";

type Method = "get" | "post" | "put" | "patch" | "delete";
function routesFor(controllers: Type<unknown>[]) {
  return controllers.flatMap((controller) => {
    const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string;
    const descriptors = Object.getOwnPropertyDescriptors(
      controller.prototype as object,
    );
    return Object.entries(descriptors).flatMap(([handler, descriptor]) => {
      if (typeof descriptor.value !== "function") return [];
      const fn = descriptor.value as (...args: unknown[]) => unknown;
      const method = Reflect.getMetadata(METHOD_METADATA, fn) as
        | RequestMethod
        | undefined;
      if (method === undefined) return [];
      const path = Reflect.getMetadata(PATH_METADATA, fn) as string;
      const policy = (Reflect.getMetadata(ACCESS_POLICY, fn) ??
        Reflect.getMetadata(ACCESS_POLICY, controller)) as
        | AccessPolicy
        | undefined;
      return [
        {
          controller,
          handler,
          policy,
          method: RequestMethod[method].toLowerCase() as Method,
          path: `/v1/${prefix}/${path}`
            .replace(/\/+$/u, "")
            .replace(/:[^/]+/gu, "missing-id"),
        },
      ];
    });
  });
}

const existingRoutes = routesFor([
  PersonsController,
  ScootersController,
  ScooterDocumentsController,
  ScooterBrandsController,
  CivVocabularyController,
  FinanceController,
]);
const managementRoutes = routesFor([
  AccessUsersController,
  AccessRolesController,
  PersonAccessController,
]);
const addedBusinessRoutes = routesFor([
  ProblemsController,
  RentalsController,
  PortalController,
]);

describe("Access management HTTP contracts (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let core: CoreAuthService;
  let mailer: SpyMailerService;
  let superToken: string;
  let superId: string;
  let existingAdminRoleId: string | undefined;
  let zeroToken: string;
  let ordinaryToken: string;
  const runId = randomUUID();
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const handlerSpies = new Map<string, jest.SpyInstance>();
  const server = (): Server => app.getHttpServer() as Server;
  const email = () => `access-http-${randomUUID()}@example.test`;
  const authed = (method: Method, path: string, token = superToken) =>
    request(server())[method](path).set("Authorization", `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService)
      .useClass(SpyMailerService)
      .compile();
    app = moduleRef.createNestApplication();
    for (const route of [
      ...existingRoutes,
      ...managementRoutes,
      ...addedBusinessRoutes,
    ]) {
      const instance = app.get<
        unknown,
        Record<string, (...args: unknown[]) => unknown>
      >(route.controller);
      const original = instance[route.handler];
      const spy = jest.spyOn(instance, route.handler);
      // Nest reads guards/DTO metadata from the registered callback itself.
      for (const key of Reflect.getMetadataKeys(original) as unknown[]) {
        Reflect.defineMetadata(key, Reflect.getMetadata(key, original), spy);
      }
      handlerSpies.set(`${route.method} ${route.path}`, spy);
    }
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    core = app.get(CoreAuthService);
    mailer = app.get(MailerService);
    // Keep preseeded test data intact while each scenario exercises a real
    // canonical role through HTTP. Restore the original slug after the suite.
    const existingAdminRole = await prisma.role.findUnique({
      where: { slug: "admin" },
    });
    if (existingAdminRole) {
      existingAdminRoleId = existingAdminRole.id;
      await prisma.role.update({
        where: { id: existingAdminRole.id },
        data: { slug: `saved-${runId}` },
      });
    }
    const superUser = await activeUser(true);
    superToken = superUser.tokens.accessToken;
    superId = superUser.user.id;
    zeroToken = (await activeUser()).tokens.accessToken;
    const ordinary = await activeUser();
    await replaceAccess(
      ordinary.user.id,
      [],
      [{ permissionKey: "persons.read", scopes: ["ALL"] }],
    );
    ordinaryToken = ordinary.tokens.accessToken;
  }, 30_000);

  afterEach(async () => {
    mailer.reset();
    await prisma.userRole.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$transaction([
        prisma.person.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.userRole.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.userPermissionOverride.deleteMany({
          where: { userId: { in: userIds } },
        }),
        prisma.userInvitation.deleteMany({
          where: {
            OR: [{ userId: { in: userIds } }, { invitedById: { in: userIds } }],
          },
        }),
        prisma.auditEvent.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.user.deleteMany({ where: { id: { in: userIds } } }),
        prisma.role.deleteMany({ where: { id: { in: roleIds } } }),
      ]);
      if (existingAdminRoleId)
        await prisma.role.update({
          where: { id: existingAdminRoleId },
          data: { slug: "admin" },
        });
    }
    await app?.close();
    jest.restoreAllMocks();
  }, 30_000);

  async function activeUser(isSuperAdmin = false) {
    const user = await prisma.user.create({
      data: { email: email(), loginStatus: "ACTIVE", isSuperAdmin },
    });
    userIds.push(user.id);
    return {
      user,
      tokens: await core.issueSession({
        user,
        ip: "127.0.0.1",
        userAgent: "access-http",
      }),
    };
  }
  async function createRole(
    name = "People reader",
    permissions: v1.access.CreateRoleInput["permissions"] = [
      { permissionKey: "persons.read", scopes: ["ALL"] },
    ],
  ) {
    // Role definitions are fixtures; public role creation is closed. The
    // generic service still exercises compatibility with stored role grants.
    const role = await app.get(AccessService).createRole(superId, {
      slug: "admin",
      name,
      description: runId,
      permissions,
    });
    roleIds.push(role.id);
    return role;
  }
  async function getUser(id: string) {
    const response = await authed("get", `/v1/users/${id}`).expect(200);
    return v1.access.accessUserSchema.parse(response.body);
  }
  async function replaceAccess(
    id: string,
    roles: v1.access.Role[],
    overrides: v1.access.UserAccessInput["overrides"] = [],
  ) {
    const current = await getUser(id);
    const response = await authed("put", `/v1/users/${id}/access`)
      .send({
        expectedRevision: current.accessRevision,
        roles: roles.map(({ id, revision }) => ({ id, revision })),
        overrides,
      })
      .expect(200);
    return v1.access.accessUserSchema.parse(response.body);
  }
  async function inviteUser(roles: v1.access.Role[] = []) {
    const response = await authed("post", "/v1/users")
      .send({
        email: email(),
        firstName: "Test",
        lastName: "Invite",
        roles: roles.map(({ id, revision }) => ({ id, revision })),
        overrides: [],
      })
      .expect(201);
    const user = v1.access.accessUserSchema.parse(response.body);
    userIds.push(user.id);
    return user;
  }
  async function me(token: string) {
    const response = await authed("get", v1.auth.ROUTES.me, token).expect(200);
    return v1.auth.sessionUserSchema.parse(response.body);
  }
  async function challenge(email: string) {
    const response = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email })
      .expect(202);
    return v1.auth.otpChallengeMetadataSchema.parse(response.body);
  }

  it("delegates user management while protecting Admin grants and definitions", async () => {
    const role = await createRole("Delegated administrator", [
      { permissionKey: "users.read", scopes: ["ALL"] },
      { permissionKey: "users.invite", scopes: ["ALL"] },
      { permissionKey: "users.roles.update", scopes: ["ALL"] },
      { permissionKey: "users.permissions.update", scopes: ["ALL"] },
      { permissionKey: "roles.read", scopes: ["ALL"] },
      { permissionKey: "roles.update", scopes: ["ALL"] },
      { permissionKey: "problems.read", scopes: ["ASSIGNED"] },
    ]);
    const administrator = await activeUser();
    await replaceAccess(administrator.user.id, [role]);
    const token = administrator.tokens.accessToken;
    const target = await activeUser();
    await authed("get", "/v1/users", token).expect(200);
    await authed("get", "/v1/access/roles", token).expect(200);
    await authed("get", `/v1/access/roles/${role.id}`, token).expect(200);
    const roleEdit = {
      expectedRevision: role.revision,
      name: role.name,
      description: role.description,
      permissions: [],
    };
    await authed("post", `/v1/access/roles/${role.id}/preview`, token)
      .send(roleEdit)
      .expect(403);
    await authed("put", `/v1/access/roles/${role.id}`, token)
      .send(roleEdit)
      .expect(403);

    const payload = {
      expectedRevision: (await getUser(target.user.id)).accessRevision,
      roles: [],
      overrides: [{ permissionKey: "problems.read", scopes: ["ASSIGNED"] }],
    };
    await authed("post", `/v1/users/${target.user.id}/access/preview`, token)
      .send(payload)
      .expect(201);
    await authed("put", `/v1/users/${target.user.id}/access`, token)
      .send(payload)
      .expect(200);
    const revision = (await getUser(target.user.id)).accessRevision;
    const denied = async (
      roles: { id: string; revision: number }[],
      overrides: unknown[],
    ) =>
      authed("put", `/v1/users/${target.user.id}/access`, token)
        .send({ expectedRevision: revision, roles, overrides })
        .expect(403);
    await denied([{ id: role.id, revision: role.revision }], []);
    await denied([], [{ permissionKey: "problems.read", scopes: ["ALL"] }]);
    await denied([], [{ permissionKey: "users.read", scopes: ["ALL"] }]);
    await authed("put", `/v1/users/${administrator.user.id}/access`, token)
      .send({
        expectedRevision: (await getUser(administrator.user.id)).accessRevision,
        roles: [],
        overrides: [],
      })
      .expect(403);
    await authed("put", `/v1/users/${superId}/access`, token)
      .send({
        expectedRevision: (await getUser(superId)).accessRevision,
        roles: [],
        overrides: [],
      })
      .expect(403);
    const otherAdmin = await activeUser();
    await replaceAccess(otherAdmin.user.id, [role]);
    await authed("put", `/v1/users/${otherAdmin.user.id}/access`, token)
      .send({
        expectedRevision: (await getUser(otherAdmin.user.id)).accessRevision,
        roles: [],
        overrides: [],
      })
      .expect(403);
    await authed("put", `/v1/users/${target.user.id}/super-admin`, token)
      .send({
        expectedRevision: revision,
        isSuperAdmin: true,
      })
      .expect(403);
  });

  it("keeps role assignment and custom permission writes independently authorized", async () => {
    const actor = await activeUser();
    await replaceAccess(
      actor.user.id,
      [],
      [
        { permissionKey: "users.read", scopes: ["ALL"] },
        { permissionKey: "roles.read", scopes: ["ALL"] },
        { permissionKey: "users.roles.update", scopes: ["ALL"] },
        { permissionKey: "problems.read", scopes: ["ASSIGNED"] },
      ],
    );
    const target = await activeUser();
    const payload = {
      expectedRevision: (await getUser(target.user.id)).accessRevision,
      roles: [],
      overrides: [{ permissionKey: "problems.read", scopes: ["ASSIGNED"] }],
    };
    await authed(
      "put",
      `/v1/users/${target.user.id}/access`,
      actor.tokens.accessToken,
    )
      .send(payload)
      .expect(403);
    await authed("post", "/v1/users", actor.tokens.accessToken)
      .send({
        email: email(),
        firstName: "",
        lastName: "",
        roles: [],
        overrides: [],
      })
      .expect(403);
  });

  it("invites a user with serialized permissions, delivery state, and audit history", async () => {
    const role = await createRole();
    const user = await inviteUser([role]);
    expect(user).toMatchObject({
      loginStatus: "INVITED",
      isSuperAdmin: false,
      roles: [{ id: role.id }],
      effectiveScopes: { "persons.read": ["ALL"] },
      invitation: {
        generation: 1,
        deliveryStatus: "SENT",
        activatedAt: null,
        cancelledAt: null,
      },
    });
    expect(mailer.findLastTo(user.email)?.text).toContain("/sign-in");
    expect(user).not.toHaveProperty("roleMemberships");
    expect(user.invitation).not.toHaveProperty("invitedById");
    const users = await authed(
      "get",
      `/v1/users?search=${encodeURIComponent(user.email)}`,
    ).expect(200);
    expect(
      v1.access.accessUserListSchema.parse(users.body).items.map((u) => u.id),
    ).toEqual([user.id]);
    const roles = await authed("get", "/v1/access/roles").expect(200);
    expect(
      v1.access.roleListSchema
        .parse(roles.body)
        .items.some((r) => r.id === role.id),
    ).toBe(true);
    const catalog = await authed("get", "/v1/access/permissions").expect(200);
    expect(catalog.body).toEqual({ items: v1.access.permissionCatalog });
    const history = await authed(
      "get",
      `/v1/users/${user.id}/audit-events`,
    ).expect(200);
    expect(
      v1.access.accessAuditListSchema.parse(history.body).items.length,
    ).toBeGreaterThan(0);
    const otp = await challenge(user.email);
    const activation = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ challengeId: otp.challengeId, code: "000000" })
      .expect(200);
    const tokens = v1.auth.tokenPairSchema.parse(activation.body);
    expect(await me(tokens.accessToken)).toMatchObject({
      id: user.id,
      effectiveScopes: { "persons.read": ["ALL"] },
    });
    const activated = await getUser(user.id);
    expect(activated.loginStatus).toBe("ACTIVE");
    expect(activated.invitation?.activatedAt).not.toBeNull();
  });

  it("persists failed invitation delivery and retries with a new generation", async () => {
    jest
      .spyOn(mailer, "send")
      .mockRejectedValueOnce(new Error("SMTP unavailable"));
    const user = await inviteUser();
    expect(user.invitation?.deliveryStatus).toBe("FAILED");
    const response = await authed("post", `/v1/users/${user.id}/invitations`)
      .send({ expectedRevision: user.accessRevision })
      .expect(201);
    const retried = v1.access.accessUserSchema.parse(response.body);
    expect(retried.invitation).toMatchObject({
      generation: 2,
      deliveryStatus: "SENT",
    });
    expect(mailer.findLastTo(user.email)).toBeDefined();
    expect(
      (
        await prisma.userInvitation.findUnique({
          where: { id: user.invitation!.id },
        })
      )?.cancelledAt,
    ).not.toBeNull();
  });

  it("changes /me and route access immediately after a role edit using the same access JWT", async () => {
    const { user, tokens } = await activeUser();
    const role = await createRole();
    await replaceAccess(user.id, [role]);
    const before = await me(tokens.accessToken);
    await authed("get", "/v1/persons", tokens.accessToken).expect(200);
    const update = {
      expectedRevision: role.revision,
      name: role.name,
      description: role.description,
      permissions: [],
    };
    const preview = await authed("post", `/v1/access/roles/${role.id}/preview`)
      .send(update)
      .expect(201);
    expect(v1.access.rolePreviewSchema.parse(preview.body)).toMatchObject({
      memberCount: 1,
      affectedMembers: [{ id: user.id }],
    });
    const response = await authed("put", `/v1/access/roles/${role.id}`)
      .send(update)
      .expect(200);
    const changed = v1.access.roleSchema.parse(response.body);
    const after = await me(tokens.accessToken);
    expect(after.effectiveScopes["persons.read"] ?? []).toEqual([]);
    expect(after.accessRevision).toBe(before.accessRevision);
    expect(after.roleVersions).toEqual([
      { id: role.id, revision: changed.revision },
    ]);
    await authed("get", "/v1/persons", tokens.accessToken).expect(403);
    await authed("put", `/v1/access/roles/${role.id}`).send(update).expect(409);
    const history = await authed(
      "get",
      `/v1/access/roles/${role.id}/audit-events`,
    ).expect(200);
    expect(
      v1.access.accessAuditListSchema.parse(history.body).items.length,
    ).toBeGreaterThan(1);
  });

  it("previews, denies, and resets one action override without changing inherited roles", async () => {
    const { user, tokens } = await activeUser();
    const role = await createRole();
    const assigned = await replaceAccess(user.id, [role]);
    const deny = {
      expectedRevision: assigned.accessRevision,
      roles: [{ id: role.id, revision: role.revision }],
      overrides: [
        {
          permissionKey: "persons.read",
          scopes: [],
          reason: "Temporary restriction",
        },
      ],
    };
    const preview = await authed("post", `/v1/users/${user.id}/access/preview`)
      .send(deny)
      .expect(201);
    expect(v1.access.accessPreviewSchema.parse(preview.body)).toMatchObject({
      before: { "persons.read": ["ALL"] },
      after: { "persons.read": [] },
      missingPrerequisites: [],
    });
    expect(
      (await me(tokens.accessToken)).effectiveScopes["persons.read"],
    ).toEqual(["ALL"]);
    await authed("put", `/v1/users/${user.id}/access`).send(deny).expect(200);
    await authed("get", "/v1/persons", tokens.accessToken).expect(403);
    const denied = await getUser(user.id);
    expect(denied.overrides).toEqual(deny.overrides);
    await replaceAccess(user.id, [role]);
    expect(
      (await me(tokens.accessToken)).effectiveScopes["persons.read"],
    ).toEqual(["ALL"]);
    await authed("get", "/v1/persons", tokens.accessToken).expect(200);
    await authed("put", `/v1/users/${user.id}/access`).send(deny).expect(409);
  });

  it("gets and updates Person app access with current revision while preserving mixed staff grants", async () => {
    const { user, tokens } = await activeUser();
    const role = await createRole();
    await replaceAccess(user.id, [role]);
    const person = await prisma.person.create({
      data: {
        userId: user.id,
        email: user.email,
        phone: `+40${Date.now()}${userIds.length}`,
        firstName: "Customer",
        lastName: "Staff",
      },
    });
    const route = `/v1/persons/${person.id}/app-access`;
    const response = await authed("get", route).expect(200);
    const before = v1.access.accessUserSchema.parse(response.body);
    expect(before).toMatchObject({
      id: user.id,
      personId: person.id,
      portalEligible: false,
    });
    const enabled = await authed("put", route)
      .send({ enabled: true, expectedRevision: before.accessRevision })
      .expect(200);
    const after = v1.access.accessUserSchema.parse(enabled.body);
    expect(after.portalEligible).toBe(true);
    expect(after.effectiveScopes).toMatchObject({
      "persons.read": ["ALL"],
      "portal.profile.read": ["OWN"],
      "portal.rentals.read": ["OWN"],
      "portal.scooter_documents.read": ["OWN"],
    });
    expect(after.roles.map((entry) => entry.id)).toEqual([role.id]);
    expect((await me(tokens.accessToken)).portalEligible).toBe(true);
    await authed("put", route)
      .send({ enabled: false, expectedRevision: before.accessRevision })
      .expect(409);
    await authed("put", route)
      .send({ enabled: false, expectedRevision: after.accessRevision })
      .expect(200);
    expect(await me(tokens.accessToken)).toMatchObject({
      portalEligible: false,
      effectiveScopes: { "persons.read": ["ALL"] },
    });
    await authed("get", "/v1/persons", tokens.accessToken).expect(200);
  });

  it("enabling client portal replaces a portal denial and preserves staff overrides", async () => {
    const { user } = await activeUser();
    await replaceAccess(
      user.id,
      [],
      [
        {
          permissionKey: "portal.profile.read",
          scopes: [],
          reason: "Previous restriction",
        },
        {
          permissionKey: "scooters.read",
          scopes: ["ASSIGNED"],
          reason: "Workshop access",
        },
      ],
    );
    const person = await prisma.person.create({
      data: {
        userId: user.id,
        email: user.email,
        phone: `+40${Date.now()}${userIds.length}`,
        firstName: "Client",
        lastName: "Mechanic",
      },
    });
    const current = await getUser(user.id);
    const response = await authed("put", `/v1/persons/${person.id}/app-access`)
      .send({ enabled: true, expectedRevision: current.accessRevision })
      .expect(200);
    const updated = v1.access.accessUserSchema.parse(response.body);
    expect(updated.effectiveScopes).toMatchObject({
      "scooters.read": ["ASSIGNED"],
      "portal.profile.read": ["OWN"],
      "portal.rentals.read": ["OWN"],
      "portal.scooter_documents.read": ["OWN"],
    });
    expect(updated.overrides).toContainEqual({
      permissionKey: "scooters.read",
      scopes: ["ASSIGNED"],
      reason: "Workshop access",
    });
    expect(
      await prisma.auditEvent.count({
        where: {
          targetId: person.id,
          type: "ACCESS_CUSTOMER_CHANGED",
        },
      }),
    ).toBe(1);
  });

  it("cancels a pending invitation and rejects its already-delivered proof", async () => {
    const user = await inviteUser();
    const otp = await challenge(user.email);
    const cancelled = await authed(
      "delete",
      `/v1/users/${user.id}/invitations/current`,
    )
      .send({ expectedRevision: user.accessRevision })
      .expect(200);
    const result = v1.access.accessUserSchema.parse(cancelled.body);
    expect(result.loginStatus).toBe("DISABLED");
    expect(result.invitation?.cancelledAt).not.toBeNull();
    await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ challengeId: otp.challengeId, code: "000000" })
      .expect(401);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("filters document audit history before pagination until document-read permission is granted", async () => {
    const { user, tokens } = await activeUser();
    const person = await prisma.person.create({
      data: {
        userId: user.id,
        email: user.email,
        phone: `+40${Date.now()}${userIds.length}`,
        firstName: "Audit",
        lastName: "Reader",
      },
    });
    const actor = {
      kind: "user",
      userId: user.id,
      email: user.email,
      name: null,
    };
    const normal = await prisma.auditEvent.create({
      data: {
        type: "PERSON_UPDATED",
        targetType: "person",
        targetId: person.id,
        userId: user.id,
        createdAt: new Date(Date.now() - 60_000),
        meta: {
          actor,
          changes: [{ field: "firstName", oldValue: "Old", newValue: "Audit" }],
        },
      },
    });
    await prisma.auditEvent.createMany({
      data: Array.from({ length: 101 }, () => ({
        type: "PERSON_DOCUMENT_UPDATED",
        targetType: "person",
        targetId: person.id,
        userId: user.id,
        meta: {
          actor,
          document: {
            id: "private-document",
            type: "nationalId",
            status: "verified",
          },
          changes: [
            { field: "number", oldValue: "654321", newValue: "123456" },
          ],
        },
      })),
    });
    const grants: v1.access.UserAccessInput["overrides"] = [
      { permissionKey: "persons.read", scopes: ["ALL"] },
      { permissionKey: "persons.audit.read", scopes: ["ALL"] },
    ];
    await replaceAccess(user.id, [], grants);
    const path = `/v1/persons/${person.id}/audit-events`;
    const restricted = await authed("get", path, tokens.accessToken).expect(
      200,
    );
    const visible = v1.persons.personAuditEventListSchema.parse(
      restricted.body,
    );
    expect(visible.map((event) => event.id)).toEqual([normal.id]);
    expect(JSON.stringify(restricted.body)).not.toContain("123456");
    await replaceAccess(
      user.id,
      [],
      [...grants, { permissionKey: "person_documents.read", scopes: ["ALL"] }],
    );
    const allowed = await authed("get", path, tokens.accessToken).expect(200);
    const documents = v1.persons.personAuditEventListSchema.parse(allowed.body);
    expect(
      documents.some((event) => event.type === "PERSON_DOCUMENT_UPDATED"),
    ).toBe(true);
    expect(JSON.stringify(allowed.body)).toContain("123456");
  });

  it.each(["SUSPENDED", "DISABLED"] as const)(
    "%s revokes existing access and refresh tokens through the status API",
    async (status) => {
      const { user, tokens } = await activeUser();
      await me(tokens.accessToken);
      const current = await getUser(user.id);
      const response = await authed("put", `/v1/users/${user.id}/status`)
        .send({ status, expectedRevision: current.accessRevision })
        .expect(200);
      expect(v1.access.accessUserSchema.parse(response.body).loginStatus).toBe(
        status,
      );
      await authed("get", v1.auth.ROUTES.me, tokens.accessToken).expect(401);
      await request(server())
        .post(v1.auth.ROUTES.refresh)
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
      expect(
        await prisma.session.count({
          where: { userId: user.id, revokedAt: null },
        }),
      ).toBe(0);
    },
  );

  it("keeps built-in roles available and super-admin authority separate from role names", async () => {
    expect((await me(ordinaryToken)).isSuperAdmin).toBe(false);
    const { user } = await activeUser();
    const role = await createRole("Super admin");
    expect((await replaceAccess(user.id, [role])).isSuperAdmin).toBe(false);
    await authed("post", `/v1/access/roles/${role.id}/archive`)
      .send({ expectedRevision: role.revision })
      .expect(400);
    await replaceAccess(user.id, []);
    await authed("post", `/v1/access/roles/${role.id}/archive`)
      .send({ expectedRevision: role.revision })
      .expect(400);
    const current = await getUser(user.id);
    await authed("put", `/v1/users/${user.id}/access`)
      .send({
        expectedRevision: current.accessRevision,
        roles: [{ id: role.id, revision: role.revision + 1 }],
        overrides: [],
      })
      .expect(409);
  });

  it("rejects forged authority and unsupported permissions in validated management DTOs", async () => {
    await authed("post", "/v1/users")
      .send({ email: email(), roles: [], overrides: [], isSuperAdmin: true })
      .expect(400);
    await authed("post", "/v1/access/roles")
      .send({
        slug: `invalid-${randomUUID()}`,
        name: "Invalid",
        permissions: [{ permissionKey: "users.manage", scopes: ["ALL"] }],
      })
      .expect(400);
    await authed("post", "/v1/access/roles")
      .send({
        slug: `invalid-${randomUUID()}`,
        name: "Invalid",
        permissions: [{ permissionKey: "persons.read", scopes: ["OWN"] }],
      })
      .expect(400);
  });

  it("rejects public creation of extra roles and multiple base-role assignments", async () => {
    await authed("post", "/v1/access/roles")
      .send({ slug: "dispatcher", name: "Dispatcher", permissions: [] })
      .expect(400);
    await authed("post", "/v1/users")
      .send({
        email: email(),
        roles: [
          { id: "one", revision: 1 },
          { id: "two", revision: 1 },
        ],
        overrides: [],
      })
      .expect(400);
    const customRole = await app.get(AccessService).createRole(superId, {
      slug: `historical-${runId}`,
      name: "Historical",
      description: "",
      permissions: [],
    });
    roleIds.push(customRole.id);
    await authed("post", "/v1/users")
      .send({
        email: email(),
        roles: [{ id: customRole.id, revision: 1 }],
        overrides: [],
      })
      .expect(400);
    await authed("put", `/v1/access/roles/${customRole.id}`)
      .send({
        expectedRevision: 1,
        name: "Historical",
        description: "",
        permissions: [],
      })
      .expect(400);
  });

  it("updates the protected super-admin designation independently of roles and immediately refreshes authority", async () => {
    const { user, tokens } = await activeUser();
    const initial = await getUser(user.id);
    const promoted = await authed("put", `/v1/users/${user.id}/super-admin`)
      .send({ expectedRevision: initial.accessRevision, isSuperAdmin: true })
      .expect(200);
    const admin = v1.access.accessUserSchema.parse(promoted.body);
    expect(admin).toMatchObject({ isSuperAdmin: true, roles: [] });
    expect((await me(tokens.accessToken)).isSuperAdmin).toBe(true);
    await authed("get", "/v1/access/roles", tokens.accessToken).expect(200);
    const demoted = await authed("put", `/v1/users/${user.id}/super-admin`)
      .send({ expectedRevision: admin.accessRevision, isSuperAdmin: false })
      .expect(200);
    expect(v1.access.accessUserSchema.parse(demoted.body).isSuperAdmin).toBe(
      false,
    );
    expect((await me(tokens.accessToken)).isSuperAdmin).toBe(false);
    await authed("get", "/v1/access/roles", tokens.accessToken).expect(403);
  });

  it("allows no-role users self service while keeping all business capabilities empty", async () => {
    const user = await me(zeroToken);
    expect(user).toMatchObject({
      isSuperAdmin: false,
      roleVersions: [],
      portalEligible: false,
    });
    expect(Object.values(user.effectiveScopes).flat()).toEqual([]);
    await authed("get", "/v1/auth/sessions", zeroToken).expect(200);
    expect(existingRoutes).toHaveLength(63);
  });

  describe.each(["zero", "ordinary"] as const)(
    "%s user cannot manage access",
    (kind) => {
      it.each(managementRoutes)(
        "$method $path rejects before the handler and DTO validation",
        async (route) => {
          const spy = handlerSpies.get(`${route.method} ${route.path}`)!;
          spy.mockClear();
          await authed(
            route.method,
            route.path,
            kind === "zero" ? zeroToken : ordinaryToken,
          )
            .send({ deliberatelyInvalid: true })
            .expect(403);
          expect(spy).not.toHaveBeenCalled();
        },
      );
    },
  );

  describe("every business policy is enforced over HTTP", () => {
    it.each([...existingRoutes, ...addedBusinessRoutes])(
      "$method $path rejects a missing action before the handler and DTO validation",
      async (route) => {
        expect(["permissions", "super"]).toContain(route.policy?.kind);
        const spy = handlerSpies.get(`${route.method} ${route.path}`)!;
        spy.mockClear();
        await authed(route.method, route.path, zeroToken)
          .send({ deliberatelyInvalid: true })
          .expect(403);
        expect(spy).not.toHaveBeenCalled();
      },
    );
  });
});
