import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { AuditService } from "../audit/audit.service";
import { AuditEventType } from "../audit/audit.types";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import type { Prisma } from "../generated/prisma/client";
import { MailerService } from "../mailer/mailer.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  enforcePrerequisites,
  missingPrerequisites,
  normalizeScopes,
  resolveScopes,
  validGrant,
  catalogByKey,
  type AccessSnapshot,
  type GrantRow,
} from "./access.resolver";

const roleInclude = {
  permissions: true,
  _count: { select: { members: true } },
} as const;
const userInclude = {
  roleMemberships: { include: { role: { include: roleInclude } } },
  permissionOverrides: true,
  person: true,
  invitations: { orderBy: { generation: "desc" as const }, take: 1 },
} as const;
type RoleRow = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;
type UserRow = Prisma.UserGetPayload<{ include: typeof userInclude }>;
const roleDto = (r: RoleRow): v1.access.Role =>
  v1.access.roleSchema.parse({
    ...r,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    memberCount: r._count.members,
    permissions: r.permissions
      .filter(validGrant)
      .map(({ permissionKey, scopes }) => ({ permissionKey, scopes })),
  });
const grantsFor = (u: UserRow) =>
  u.roleMemberships
    .filter((m) => !m.role.archivedAt)
    .flatMap((m) => m.role.permissions);

@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    @Inject(ENV) private readonly env: Env,
  ) {}
  async getSnapshot(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AccessSnapshot> {
    const user = await (tx ?? this.prisma).user.findUnique({
      where: { id: userId },
      include: userInclude,
    });
    if (!user || user.deletedAt || user.loginStatus !== "ACTIVE")
      throw new ForbiddenException("Account is not active");
    for (const row of [...grantsFor(user), ...user.permissionOverrides])
      if (!validGrant(row))
        this.logger.warn(
          { userId, permissionKey: row.permissionKey },
          "Invalid stored access grant; denied",
        );
    return this.snapshot(user);
  }
  private snapshot(user: UserRow): AccessSnapshot {
    return {
      userId: user.id,
      isSuperAdmin: user.isSuperAdmin,
      effectiveScopes: enforcePrerequisites(
        resolveScopes(grantsFor(user), user.permissionOverrides),
      ),
      accessRevision: user.accessRevision,
      portalEligible:
        !!user.person?.customerAccessEnabled && !user.person.deletedAt,
      roleVersions: user.roleMemberships
        .filter((m) => !m.role.archivedAt)
        .map((m) => ({ id: m.roleId, revision: m.role.revision }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
  }
  private userDto(user: UserRow): v1.access.AccessUser {
    const inv = user.invitations[0];
    return v1.access.accessUserSchema.parse({
      ...user,
      ...this.snapshot(user),
      roles: user.roleMemberships.map((m) => roleDto(m.role)),
      overrides: user.permissionOverrides
        .filter((row) => catalogByKey.has(row.permissionKey))
        .map((row) => ({
          permissionKey: row.permissionKey,
          scopes: validGrant(row) ? row.scopes : [],
          reason: row.reason,
        })),
      deletedAt: user.deletedAt?.toISOString() ?? null,
      personId: user.person?.id ?? null,
      invitation: inv
        ? {
            ...inv,
            expiresAt: inv.expiresAt.toISOString(),
            activatedAt: inv.activatedAt?.toISOString() ?? null,
            cancelledAt: inv.cancelledAt?.toISOString() ?? null,
          }
        : null,
    });
  }
  private async lock(tx: Prisma.TransactionClient, actorId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(726001)`;
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (
      !actor ||
      actor.deletedAt ||
      actor.loginStatus !== "ACTIVE" ||
      !actor.isSuperAdmin
    )
      throw new ForbiddenException("Super admin required");
  }
  private async user(
    tx: Prisma.TransactionClient,
    id: string,
    revision?: number,
  ) {
    const user = await tx.user.findUnique({
      where: { id },
      include: userInclude,
    });
    if (!user) throw new NotFoundException("User not found");
    if (revision !== undefined && user.accessRevision !== revision)
      throw new ConflictException("Access changed. Reload and review again.");
    return user;
  }
  private validate(rows: readonly GrantRow[], allowEmpty: boolean) {
    const keys = new Set<string>();
    for (const row of rows) {
      if (
        keys.has(row.permissionKey) ||
        !validGrant(row) ||
        (!allowEmpty && !row.scopes.length)
      )
        throw new BadRequestException("Invalid or duplicate permission");
      keys.add(row.permissionKey);
    }
  }
  private async proposed(
    tx: Prisma.TransactionClient,
    input: Pick<v1.access.UserAccessInput, "roles" | "overrides">,
  ) {
    if (new Set(input.roles.map((r) => r.id)).size !== input.roles.length)
      throw new BadRequestException("Duplicate role");
    this.validate(input.overrides, true);
    const roles = await tx.role.findMany({
      where: { id: { in: input.roles.map((r) => r.id) } },
      include: { permissions: true },
    });
    for (const requested of input.roles) {
      const role = roles.find((r) => r.id === requested.id);
      if (!role || role.archivedAt || role.revision !== requested.revision)
        throw new ConflictException(
          "Role changed or is unavailable. Reload and review again.",
        );
    }
    const scopes = resolveScopes(
      roles.flatMap((r) => r.permissions),
      input.overrides,
    );
    return { roles, scopes, missing: missingPrerequisites(scopes) };
  }
  private async replaceAccess(
    tx: Prisma.TransactionClient,
    id: string,
    input: Pick<v1.access.UserAccessInput, "roles" | "overrides">,
  ) {
    const proposed = await this.proposed(tx, input);
    if (proposed.missing.length)
      throw new BadRequestException({
        message: "Missing permission prerequisites",
        missingPrerequisites: proposed.missing,
      });
    await tx.userRole.deleteMany({ where: { userId: id } });
    if (input.roles.length)
      await tx.userRole.createMany({
        data: input.roles.map((r) => ({ userId: id, roleId: r.id })),
      });
    await tx.userPermissionOverride.deleteMany({ where: { userId: id } });
    if (input.overrides.length)
      await tx.userPermissionOverride.createMany({
        data: input.overrides.map((o) => ({
          userId: id,
          permissionKey: o.permissionKey,
          scopes: normalizeScopes(o.scopes),
          reason: o.reason,
        })),
      });
    await tx.user.update({
      where: { id },
      data: { accessRevision: { increment: 1 } },
    });
  }
  private async event(
    tx: Prisma.TransactionClient,
    actorId: string,
    type: (typeof AuditEventType)[keyof typeof AuditEventType],
    targetType: string,
    targetId: string,
    before: unknown,
    after: unknown,
  ) {
    await this.audit.recordRequired(tx, {
      type,
      userId: actorId,
      targetType,
      targetId,
      meta: JSON.parse(
        JSON.stringify({ before, after }),
      ) as Prisma.InputJsonValue,
    });
  }
  async history(targetType: string, targetId: string) {
    const items = await this.prisma.auditEvent.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        createdAt: true,
        userId: true,
        meta: true,
      },
    });
    return {
      items: items.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    };
  }
  async listUsers(search = "", offset = 0) {
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: { email: "asc" },
        skip: offset,
        take: 100,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map((u) => this.userDto(u)), total };
  }
  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
    if (!user) throw new NotFoundException("User not found");
    return this.userDto(user);
  }
  async previewAccess(
    actorId: string,
    id: string,
    input: v1.access.UserAccessInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actorId);
      const user = await this.user(tx, id, input.expectedRevision);
      const proposed = await this.proposed(tx, input);
      return {
        before: resolveScopes(grantsFor(user), user.permissionOverrides),
        after: proposed.scopes,
        missingPrerequisites: proposed.missing,
      };
    });
  }
  async updateAccess(
    actorId: string,
    id: string,
    input: v1.access.UserAccessInput,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actorId);
      const user = await this.user(tx, id, input.expectedRevision);
      if (user.deletedAt) throw new ConflictException("Deactivated user");
      await this.replaceAccess(tx, id, input);
      await this.event(
        tx,
        actorId,
        AuditEventType.ACCESS_USER_CHANGED,
        "User",
        id,
        this.userDto(user),
        input,
      );
    });
    return this.getUser(id);
  }
  async createUser(actorId: string, input: v1.access.CreateUserInput) {
    this.checkActivationMethod();
    const id = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actorId);
      let user = await tx.user.findUnique({ where: { email: input.email } });
      if (user && (user.deletedAt || user.loginStatus !== "DISABLED"))
        throw new ConflictException(
          "User already exists. Edit their access explicitly.",
        );
      if (!user)
        user = await tx.user.create({
          data: {
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
          },
        });
      await this.replaceAccess(tx, user.id, input);
      await this.newInvitation(tx, actorId, user.id, user.email);
      await this.event(
        tx,
        actorId,
        AuditEventType.ACCESS_USER_CREATED,
        "User",
        user.id,
        null,
        input,
      );
      return user.id;
    });
    await this.deliver(id);
    return this.getUser(id);
  }
  private checkActivationMethod() {
    if (
      !this.env.AUTH_EMAIL_OTP_ENABLED &&
      !this.env.AUTH_GOOGLE_ENABLED &&
      !this.env.AUTH_APPLE_ENABLED
    )
      throw new BadRequestException(
        "Enable a sign-in method before inviting users",
      );
  }
  private async invalidateChallenges(
    tx: Prisma.TransactionClient,
    id: string,
    email: string,
  ) {
    await tx.otpChallenge.updateMany({
      where: { OR: [{ userId: id }, { target: email }], usedAt: null },
      data: { usedAt: new Date(), activeKey: null },
    });
  }
  private async newInvitation(
    tx: Prisma.TransactionClient,
    actorId: string,
    id: string,
    email: string,
  ) {
    const latest = await tx.userInvitation.findFirst({
      where: { userId: id },
      orderBy: { generation: "desc" },
    });
    const now = new Date();
    await tx.userInvitation.updateMany({
      where: { userId: id, activatedAt: null, cancelledAt: null },
      data: { cancelledAt: now },
    });
    await this.invalidateChallenges(tx, id, email);
    const inv = await tx.userInvitation.create({
      data: {
        userId: id,
        email,
        generation: (latest?.generation ?? 0) + 1,
        invitedById: actorId,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    await tx.user.update({
      where: { id },
      data: { loginStatus: "INVITED", accessRevision: { increment: 1 } },
    });
    await this.event(
      tx,
      actorId,
      AuditEventType.ACCESS_INVITED,
      "User",
      id,
      null,
      { generation: inv.generation, expiresAt: inv.expiresAt },
    );
  }
  async invite(actorId: string, id: string, revision: number) {
    this.checkActivationMethod();
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actorId);
      const user = await this.user(tx, id, revision);
      if (user.deletedAt || !["DISABLED", "INVITED"].includes(user.loginStatus))
        throw new ConflictException(
          "Only disabled or invited users can be invited",
        );
      await this.newInvitation(tx, actorId, id, user.email);
    });
    await this.deliver(id);
    return this.getUser(id);
  }
  private async deliver(id: string) {
    const inv = await this.prisma.userInvitation.findFirst({
      where: { userId: id, cancelledAt: null, activatedAt: null },
      orderBy: { generation: "desc" },
    });
    if (!inv) return;
    let deliveryStatus: "SENT" | "FAILED" = "SENT";
    try {
      await this.mailer.send({
        to: inv.email,
        subject: "Your Scooter City access",
        text: `You have been invited to Scooter City. Sign in with this email at ${this.env.APP_BASE_URL}/sign-in before ${inv.expiresAt.toISOString()}. This link does not sign you in.`,
      });
    } catch {
      deliveryStatus = "FAILED";
      this.logger.warn({ invitationId: inv.id }, "Invitation delivery failed");
    }
    await this.prisma.userInvitation.updateMany({
      where: { id: inv.id, cancelledAt: null, activatedAt: null },
      data: { deliveryStatus },
    });
  }
  async cancelInvitation(actorId: string, id: string, revision: number) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actorId);
      const user = await this.user(tx, id, revision);
      if (user.loginStatus !== "INVITED")
        throw new ConflictException("No pending invitation");
      await tx.userInvitation.updateMany({
        where: { userId: id, activatedAt: null, cancelledAt: null },
        data: { cancelledAt: new Date() },
      });
      await tx.user.update({
        where: { id },
        data: { loginStatus: "DISABLED", accessRevision: { increment: 1 } },
      });
      await this.invalidateChallenges(tx, id, user.email);
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.event(
        tx,
        actorId,
        AuditEventType.ACCESS_INVITATION_CANCELLED,
        "User",
        id,
        { status: user.loginStatus },
        { status: "DISABLED" },
      );
    });
    return this.getUser(id);
  }
  private async protectLastAdmin(tx: Prisma.TransactionClient, user: UserRow) {
    if (
      user.isSuperAdmin &&
      user.loginStatus === "ACTIVE" &&
      !user.deletedAt &&
      (await tx.user.count({
        where: { isSuperAdmin: true, loginStatus: "ACTIVE", deletedAt: null },
      })) <= 1
    )
      throw new ConflictException(
        "At least one active super admin must remain",
      );
  }
  async setStatus(
    actorId: string,
    id: string,
    input: {
      status: "ACTIVE" | "SUSPENDED" | "DISABLED";
      expectedRevision: number;
    },
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actorId);
      const user = await this.user(tx, id, input.expectedRevision);
      if (user.deletedAt) throw new ConflictException("Deactivated user");
      if (
        input.status === "ACTIVE" &&
        user.loginStatus !== "SUSPENDED" &&
        user.loginStatus !== "ACTIVE"
      )
        throw new BadRequestException(
          "Invite this user to verify their identity first",
        );
      if (input.status !== "ACTIVE") await this.protectLastAdmin(tx, user);
      await tx.user.update({
        where: { id },
        data: { loginStatus: input.status, accessRevision: { increment: 1 } },
      });
      if (input.status !== "ACTIVE") {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await this.invalidateChallenges(tx, id, user.email);
        await tx.userInvitation.updateMany({
          where: { userId: id, activatedAt: null, cancelledAt: null },
          data: { cancelledAt: new Date() },
        });
      }
      await this.event(
        tx,
        actorId,
        AuditEventType.ACCESS_STATUS_CHANGED,
        "User",
        id,
        { status: user.loginStatus },
        { status: input.status },
      );
    });
    return this.getUser(id);
  }
  async setSuperAdmin(
    actorId: string,
    id: string,
    input: { isSuperAdmin: boolean; expectedRevision: number },
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actorId);
      const user = await this.user(tx, id, input.expectedRevision);
      if (user.deletedAt || user.loginStatus !== "ACTIVE")
        throw new ConflictException("Super admins must be active");
      if (!input.isSuperAdmin) await this.protectLastAdmin(tx, user);
      await tx.user.update({
        where: { id },
        data: {
          isSuperAdmin: input.isSuperAdmin,
          accessRevision: { increment: 1 },
        },
      });
      await this.event(
        tx,
        actorId,
        AuditEventType.ACCESS_SUPER_ADMIN_CHANGED,
        "User",
        id,
        { isSuperAdmin: user.isSuperAdmin },
        { isSuperAdmin: input.isSuperAdmin },
      );
    });
    return this.getUser(id);
  }
  async personAccess(personId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
    });
    if (!person || person.deletedAt)
      throw new NotFoundException("Person not found");
    return this.getUser(person.userId);
  }
  async customerAccess(
    actorId: string,
    personId: string,
    input: { enabled: boolean; expectedRevision: number },
  ) {
    const id = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actorId);
      const person = await tx.person.findUnique({ where: { id: personId } });
      if (!person || person.deletedAt)
        throw new NotFoundException("Person not found");
      const user = await this.user(tx, person.userId, input.expectedRevision);
      const portalOverridesBefore = user.permissionOverrides.filter((row) =>
        row.permissionKey.startsWith("portal."),
      );
      if (input.enabled) {
        const scopes = resolveScopes(grantsFor(user), user.permissionOverrides);
        for (const permissionKey of v1.access.permissionKeys.filter((key) =>
          key.startsWith("portal."),
        )) {
          if (scopes[permissionKey]?.includes("OWN")) continue;
          await tx.userPermissionOverride.upsert({
            where: { userId_permissionKey: { userId: user.id, permissionKey } },
            create: { userId: user.id, permissionKey, scopes: ["OWN"] },
            update: { scopes: ["OWN"], reason: null },
          });
        }
      }
      await tx.person.update({
        where: { id: personId },
        data: { customerAccessEnabled: input.enabled },
      });
      await tx.user.update({
        where: { id: person.userId },
        data: { accessRevision: { increment: 1 } },
      });
      await this.event(
        tx,
        actorId,
        AuditEventType.ACCESS_CUSTOMER_CHANGED,
        "Person",
        personId,
        {
          enabled: person.customerAccessEnabled,
          overrides: portalOverridesBefore,
        },
        {
          enabled: input.enabled,
          overrides: await tx.userPermissionOverride.findMany({
            where: {
              userId: user.id,
              permissionKey: { startsWith: "portal." },
            },
          }),
        },
      );
      return person.userId;
    });
    return this.getUser(id);
  }
  async listRoles() {
    return {
      items: (
        await this.prisma.role.findMany({
          include: roleInclude,
          orderBy: { name: "asc" },
        })
      ).map(roleDto),
    };
  }
  /** Public assignments use one built-in base; legacy resolution stays generic. */
  async assertBaseRoles(roles: { id: string }[]) {
    if (roles.length > 1) throw new BadRequestException("Choose one base role");
    for (const requested of roles) await this.assertBuiltInRole(requested.id);
  }
  async assertBuiltInRole(id: string) {
    const role = await this.getRole(id);
    if (
      role.archivedAt ||
      !(v1.access.BASE_ROLE_SLUGS as readonly string[]).includes(role.slug)
    )
      throw new BadRequestException("Choose Admin, Mechanic, or Client");
  }
  async getRole(id: string) {
    const row = await this.prisma.role.findUnique({
      where: { id },
      include: roleInclude,
    });
    if (!row) throw new NotFoundException("Role not found");
    return roleDto(row);
  }
  async createRole(actorId: string, input: v1.access.CreateRoleInput) {
    this.validate(input.permissions, true);
    const permissions = input.permissions
      .filter((p) => p.scopes.length)
      .map((p) => ({ ...p, scopes: normalizeScopes(p.scopes) }));
    const id = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actorId);
      if (await tx.role.findUnique({ where: { slug: input.slug } }))
        throw new ConflictException("Role slug exists");
      const role = await tx.role.create({
        data: {
          slug: input.slug,
          name: input.name,
          description: input.description,
          permissions: { create: permissions },
        },
      });
      await this.event(
        tx,
        actorId,
        AuditEventType.ACCESS_ROLE_CREATED,
        "Role",
        role.id,
        null,
        input,
      );
      return role.id;
    });
    return this.getRole(id);
  }
  private async roleImpact(
    tx: Prisma.TransactionClient,
    id: string,
    input: v1.access.UpdateRoleInput,
  ) {
    const role = await tx.role.findUnique({
      where: { id },
      include: roleInclude,
    });
    if (!role) throw new NotFoundException("Role not found");
    if (role.archivedAt || role.revision !== input.expectedRevision)
      throw new ConflictException("Role changed or archived");
    this.validate(input.permissions, true);
    const members = await tx.user.findMany({
      where: { roleMemberships: { some: { roleId: id } } },
      include: userInclude,
    });
    return {
      role,
      memberCount: members.length,
      affectedMembers: members.map((u) => {
        const before = resolveScopes(grantsFor(u), u.permissionOverrides);
        const after = resolveScopes(
          [
            ...u.roleMemberships
              .filter((m) => m.roleId !== id && !m.role.archivedAt)
              .flatMap((m) => m.role.permissions),
            ...input.permissions,
          ],
          u.permissionOverrides,
        );
        return {
          id: u.id,
          email: u.email,
          before,
          after,
          missingPrerequisites: missingPrerequisites(after),
        };
      }),
    };
  }
  async previewRole(
    actorId: string,
    id: string,
    input: v1.access.UpdateRoleInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actorId);
      const impact = await this.roleImpact(tx, id, input);
      return {
        memberCount: impact.memberCount,
        affectedMembers: impact.affectedMembers,
      };
    });
  }
  async updateRole(
    actorId: string,
    id: string,
    input: v1.access.UpdateRoleInput,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actorId);
      const impact = await this.roleImpact(tx, id, input);
      if (impact.affectedMembers.some((m) => m.missingPrerequisites.length))
        throw new BadRequestException(
          "Role edit leaves a member without required permissions. Review impact first.",
        );
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      const permissions = input.permissions.filter((p) => p.scopes.length);
      if (permissions.length)
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({
            roleId: id,
            permissionKey: p.permissionKey,
            scopes: normalizeScopes(p.scopes),
          })),
        });
      await tx.role.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          revision: { increment: 1 },
        },
      });
      await this.event(
        tx,
        actorId,
        AuditEventType.ACCESS_ROLE_CHANGED,
        "Role",
        id,
        roleDto(impact.role),
        input,
      );
    });
    return this.getRole(id);
  }
  async archiveRole(actorId: string, id: string, revision: number) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actorId);
      const role = await tx.role.findUnique({
        where: { id },
        include: roleInclude,
      });
      if (!role) throw new NotFoundException("Role not found");
      if ((v1.access.BASE_ROLE_SLUGS as readonly string[]).includes(role.slug))
        throw new BadRequestException("Built-in roles cannot be archived");
      if (role.revision !== revision || role.archivedAt)
        throw new ConflictException("Role changed or archived");
      if (role._count.members)
        throw new ConflictException(
          "Remove or replace all role assignments before archiving",
        );
      await tx.role.update({
        where: { id },
        data: { archivedAt: new Date(), revision: { increment: 1 } },
      });
      await this.event(
        tx,
        actorId,
        AuditEventType.ACCESS_ROLE_ARCHIVED,
        "Role",
        id,
        roleDto(role),
        { archived: true },
      );
    });
    return this.getRole(id);
  }
}
