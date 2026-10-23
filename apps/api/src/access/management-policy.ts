import { ForbiddenException } from "@nestjs/common";
import type { AccessSnapshot } from "./access.resolver";
import type { v1 } from "@repo/api-shared";

export function requireManagementPermission(
  actor: AccessSnapshot,
  permission: string,
) {
  if (
    !actor.isSuperAdmin &&
    !actor.effectiveScopes[permission]?.includes("ALL")
  )
    throw new ForbiddenException("Permission required");
}

export function assertManageableUser(
  actor: AccessSnapshot,
  target: {
    id: string;
    isSuperAdmin: boolean;
    roleMemberships: { role: { slug: string; archivedAt: Date | null } }[];
  },
) {
  if (actor.isSuperAdmin) return;
  if (
    actor.userId === target.id ||
    target.isSuperAdmin ||
    target.roleMemberships.some(
      ({ role }) => role.slug === "admin" && !role.archivedAt,
    )
  )
    throw new ForbiddenException(
      "Only Super Admins can change their own access or an administrator's access",
    );
}

export function assertDelegable(
  actor: AccessSnapshot,
  scopes: v1.access.EffectiveScopes,
  roleSlugs: string[] = [],
) {
  if (actor.isSuperAdmin) return;
  if (roleSlugs.includes("admin"))
    throw new ForbiddenException("Only Super Admins can assign the Admin role");
  for (const [key, values] of Object.entries(scopes)) {
    if (!values.length) continue;
    if (key.startsWith("users.") || key.startsWith("roles."))
      throw new ForbiddenException(
        "Only Super Admins can grant administration permissions",
      );
    const owned = actor.effectiveScopes[key] ?? [];
    if (
      !owned.includes("ALL") &&
      values.some((scope) => !owned.includes(scope))
    )
      throw new ForbiddenException(
        "Cannot grant permissions beyond your own access",
      );
  }
}
