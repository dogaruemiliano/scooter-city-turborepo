/** Explicit operator command; dry-run by default. Never runs at application startup. */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { v1 } from "@repo/api-shared";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedAccessRoles } from "../prisma/seeds/access";

const args = process.argv.slice(2);
const value = (flag: string) => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};
const email = v1.common.normalizedEmailSchema.parse(value("--email"));
const reviewed = (value("--reviewed-emails") ?? "")
  .split(",")
  .filter(Boolean)
  .map((e) => v1.common.normalizedEmailSchema.parse(e));
const apply = args.includes("--apply");
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL must explicitly select the target database");
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  }),
});
async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      roles: true,
      loginStatus: true,
      isSuperAdmin: true,
      deletedAt: true,
      _count: { select: { sessions: true, financeBookMemberships: true } },
    },
    orderBy: { email: "asc" },
  });
  console.log(
    JSON.stringify(
      {
        apply,
        bootstrapEmail: email,
        reviewedEmails: reviewed,
        users: users.map((u) => ({
          ...u,
          proposed:
            u.email === email
              ? "bootstrap"
              : reviewed.includes(u.email)
                ? "reviewed legacy staff (Admin with preserved legacy access)"
                : u.loginStatus,
        })),
      },
      null,
      2,
    ),
  );
  if (!apply) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(726001)`;
    const active = await tx.user.findMany({
      where: { isSuperAdmin: true, loginStatus: "ACTIVE", deletedAt: null },
    });
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing?.deletedAt)
      throw new Error("Cannot bootstrap a deactivated identity");
    if (active.length && !active.some((u) => u.email === email))
      throw new Error(
        "An active super admin exists; use user management to delegate access",
      );
    await seedAccessRoles(tx);
    const admin = await tx.user.upsert({
      where: { email },
      create: {
        email,
        isSuperAdmin: true,
        loginStatus: "ACTIVE",
        roles: ["ADMIN", "SUPER_ADMIN"],
      },
      update: active.some((u) => u.email === email)
        ? {}
        : {
            isSuperAdmin: true,
            loginStatus: "ACTIVE",
            roles: ["ADMIN", "SUPER_ADMIN"],
            accessRevision: { increment: 1 },
          },
    });
    const baseRole = await tx.role.findUniqueOrThrow({
      where: { slug: "admin" },
      include: { permissions: true },
    });
    if (baseRole.archivedAt)
      throw new Error(
        "Admin role is archived; resolve the role migration before bootstrapping",
      );
    for (const approvedEmail of reviewed) {
      const user = await tx.user.findUnique({
        where: { email: approvedEmail },
        include: { roleMemberships: true, permissionOverrides: true },
      });
      if (!user || user.deletedAt || !user.roles.includes("ADMIN"))
        throw new Error(
          `Reviewed legacy account missing or not a legacy administrator: ${approvedEmail}`,
        );
      if (user.roleMemberships.length || user.permissionOverrides.length)
        throw new Error(
          `Reviewed account already has managed access; use user management: ${approvedEmail}`,
        );
      await tx.user.update({
        where: { id: user.id },
        data: { loginStatus: "ACTIVE", accessRevision: { increment: 1 } },
      });
      await tx.userRole.create({
        data: { userId: user.id, roleId: baseRole.id },
      });
      // Keep the previous reviewed-legacy behavior: new repairs, rentals, and
      // portal permissions must not be granted by adopting the Admin base role.
      const legacyKeys = v1.access.permissionKeys.filter(
        (key) => !/^(portal|problems|rentals)\./u.test(key),
      );
      const inherited = new Map(
        baseRole.permissions.map((grant) => [
          grant.permissionKey,
          grant.scopes,
        ]),
      );
      const overrides = v1.access.permissionKeys.flatMap((permissionKey) => {
        const scopes: v1.access.PermissionScope[] = legacyKeys.includes(
          permissionKey,
        )
          ? ["ALL"]
          : [];
        const fromRole = inherited.get(permissionKey) ?? [];
        return JSON.stringify(fromRole) === JSON.stringify(scopes)
          ? []
          : [
              {
                userId: user.id,
                permissionKey,
                scopes,
                reason: "Legacy access preserved by explicit bootstrap.",
              },
            ];
      });
      if (overrides.length)
        await tx.userPermissionOverride.createMany({ data: overrides });
    }
    await tx.session.updateMany({
      where: { user: { loginStatus: { not: "ACTIVE" } }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        type: "ACCESS_BOOTSTRAPPED",
        userId: admin.id,
        targetType: "User",
        targetId: admin.id,
        meta: { bootstrapEmail: email, reviewedEmails: reviewed },
      },
    });
  });
  console.log(
    "Explicit access bootstrap applied. No unreviewed accounts were admitted.",
  );
}
main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Bootstrap failed");
    process.exitCode = 1;
  });
