import { v1 } from "@repo/api-shared";
import type { Prisma } from "../../src/generated/prisma/client";

type Grants = {
  permissionKey: v1.access.PermissionKey;
  scopes: v1.access.PermissionScope[];
}[];
const all = (keys: readonly v1.access.PermissionKey[]): Grants =>
  keys.map((permissionKey) => ({ permissionKey, scopes: ["ALL"] }));
const staffKeys = v1.access.permissionKeys.filter(
  (k) => !k.startsWith("portal.") && k !== "problems.claim",
);
export const initialRoles: {
  slug: string;
  name: string;
  permissions: Grants;
}[] = [
  {
    slug: "admin",
    name: "Admin",
    permissions: [
      ...all(staffKeys),
      { permissionKey: "problems.claim", scopes: ["AVAILABLE"] },
    ],
  },
  {
    slug: "mechanic",
    name: "Mechanic",
    permissions: [
      { permissionKey: "problems.read", scopes: ["ASSIGNED", "AVAILABLE"] },
      { permissionKey: "problems.claim", scopes: ["AVAILABLE"] },
      { permissionKey: "problems.update", scopes: ["ASSIGNED"] },
      { permissionKey: "problems.resolve", scopes: ["ASSIGNED"] },
      { permissionKey: "scooters.read", scopes: ["ASSIGNED"] },
    ],
  },
  {
    slug: "customer",
    name: "Client",
    permissions: v1.access.permissionKeys
      .filter((k) => k.startsWith("portal."))
      .map((permissionKey) => ({ permissionKey, scopes: ["OWN"] })),
  },
];
/** Called only by explicit seed/bootstrap; never overwrites an edited role. */
export async function seedAccessRoles(tx: Prisma.TransactionClient) {
  for (const role of initialRoles) {
    if (await tx.role.findUnique({ where: { slug: role.slug } })) continue;
    const created = await tx.role.create({
      data: {
        slug: role.slug,
        name: role.name,
        permissions: { create: role.permissions },
      },
    });
    await tx.auditEvent.create({
      data: {
        type: "ACCESS_ROLE_CREATED",
        targetType: "Role",
        targetId: created.id,
        meta: { source: "explicit-seed", permissions: role.permissions },
      },
    });
  }
}
