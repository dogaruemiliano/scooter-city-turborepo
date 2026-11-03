import { v1 } from "@repo/api-shared";
import type { Prisma } from "../generated/prisma/client";
import { assignedProblemWhere } from "../access/access.ability";
import {
  enforcePrerequisites,
  resolveScopes,
  type AccessSnapshot,
} from "../access/access.resolver";

export const notificationUserInclude = {
  roleMemberships: {
    include: { role: { include: { permissions: true } } },
  },
  permissionOverrides: true,
} as const;

type NotificationUser = Prisma.UserGetPayload<{
  include: typeof notificationUserInclude;
}>;

/** Pure projection: also usable inside the originating business transaction. */
export function snapshotForNotificationUser(
  user: NotificationUser,
): AccessSnapshot {
  const memberships = user.roleMemberships.filter(
    ({ role }) => !role.archivedAt,
  );
  return {
    userId: user.id,
    isSuperAdmin: user.isSuperAdmin,
    isAdmin: memberships.some(({ role }) => role.slug === "admin"),
    effectiveScopes: enforcePrerequisites(
      resolveScopes(
        memberships.flatMap(({ role }) => role.permissions),
        user.permissionOverrides,
      ),
    ),
    accessRevision: user.accessRevision,
    portalEligible: false,
    roleVersions: memberships.map(({ role }) => ({
      id: role.id,
      revision: role.revision,
    })),
  };
}

export function hasNotificationScope(
  snapshot: AccessSnapshot,
  scope: "ALL" | "ASSIGNED",
): boolean {
  return (
    snapshot.isSuperAdmin ||
    !!snapshot.effectiveScopes["notifications.receive"]?.includes(scope)
  );
}

const noEvents: Prisma.NotificationEventWhereInput = { id: { in: [] } };

function assignedEvents(
  snapshot: AccessSnapshot,
): Prisma.NotificationEventWhereInput {
  const scopes = snapshot.effectiveScopes["problems.read"] ?? [];
  if (
    !snapshot.isSuperAdmin &&
    !scopes.includes("ASSIGNED") &&
    !scopes.includes("ALL")
  )
    return noEvents;
  return {
    permissionKey: "problems.read",
    subjectType: "issue",
    problem: {
      is: {
        AND: [
          assignedProblemWhere(snapshot.userId),
          { scooter: { is: { deletedAt: null } } },
        ],
      },
    },
  };
}

/** Source grants and record scope are part of SQL, before counts/pagination. */
export function activityEventWhere(
  snapshot: AccessSnapshot,
): Prisma.NotificationEventWhereInput {
  const sourceKeys = v1.access.permissionCatalog
    .filter(
      ({ key }) =>
        !key.startsWith("notifications.") &&
        !key.startsWith("portal.") &&
        (snapshot.isSuperAdmin ||
          snapshot.effectiveScopes[key]?.includes("ALL")),
    )
    .map(({ key }) => key);
  return {
    OR: [
      {
        permissionKey: {
          in: [
            ...sourceKeys,
            ...(snapshot.isSuperAdmin ? ["super_admin"] : []),
          ],
        },
        ...(snapshot.isSuperAdmin || snapshot.isAdmin
          ? {}
          : { subjectType: { not: "todo" } }),
      },
      assignedEvents(snapshot),
    ],
  };
}

export function notificationEventWhere(
  snapshot: AccessSnapshot,
): Prisma.NotificationEventWhereInput {
  if (hasNotificationScope(snapshot, "ALL"))
    return activityEventWhere(snapshot);
  if (hasNotificationScope(snapshot, "ASSIGNED"))
    return assignedEvents(snapshot);
  return noEvents;
}

/** A removed-assignment notice deliberately exposes no subject information. */
export function canReceiveRemovalNotice(snapshot: AccessSnapshot): boolean {
  return (
    (hasNotificationScope(snapshot, "ALL") ||
      hasNotificationScope(snapshot, "ASSIGNED")) &&
    (snapshot.isSuperAdmin ||
      (snapshot.effectiveScopes["problems.read"] ?? []).some(
        (scope) => scope === "ASSIGNED" || scope === "ALL",
      ))
  );
}

export function notificationWhere(
  snapshot: AccessSnapshot,
): Prisma.NotificationWhereInput {
  return {
    recipientId: snapshot.userId,
    OR: [
      {
        reason: { not: "unassigned" },
        event: { is: notificationEventWhere(snapshot) },
      },
      ...(canReceiveRemovalNotice(snapshot) ? [{ reason: "unassigned" }] : []),
    ],
  };
}
