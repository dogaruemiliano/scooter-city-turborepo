/** UI hints only. The API independently authorizes every action and record. */
export interface AccessIdentity {
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  effectiveScopes?: Readonly<Record<string, readonly string[] | undefined>>;
  portalEligible?: boolean;
}

export function canAccess(
  user: AccessIdentity | null | undefined,
  action: string,
  scope?: string,
): boolean {
  if (!user) return false;
  if (action.startsWith("portal.") && !user.portalEligible) return false;
  if (user.isSuperAdmin) return true;
  const scopes = user.effectiveScopes?.[action] ?? [];
  return scope
    ? scopes.includes("ALL") || scopes.includes(scope)
    : scopes.length > 0;
}

export function canVisit(
  user: AccessIdentity | null | undefined,
  path: string,
): boolean {
  if (path.startsWith("/company") || path === "/finance/settings")
    return user?.isSuperAdmin === true;
  if (path === "/users" || path.startsWith("/users/"))
    return canAccess(user, "users.read");
  if (path === "/roles" || path.startsWith("/roles/"))
    return canAccess(user, "roles.read");
  const actions: Record<string, string> = {
    "/persons": "persons.read",
    "/scooters": "scooters.read",
    "/scooters/brands": "scooter_brands.read",
    "/finance": "finance.accounts.read",
    "/finance/expenses": "finance.operations.read",
    "/finance/operations": "finance.operations.read",
    "/finance/accounts": "finance.accounts.read",
    "/finance/settlement": "finance.settlements.preview",
    "/problems": "problems.read",
    "/rentals": "rentals.read",
    "/my-rentals": "portal.rentals.read",
  };
  if (path === "/scooters") return canAccess(user, "scooters.read", "ALL");
  const action = actions[path];
  return action ? canAccess(user, action) : false;
}

/** Scoped service workers use the problems workspace as their home screen. */
export function usesServiceDashboard(
  user: AccessIdentity | null | undefined,
): boolean {
  return (
    canAccess(user, "problems.read") &&
    !canAccess(user, "problems.read", "ALL") &&
    !canAccess(user, "scooters.read", "ALL")
  );
}

export function canManageUser(
  actor: (AccessIdentity & { id?: string }) | null | undefined,
  target: {
    id: string;
    isSuperAdmin: boolean;
    roles: { slug: string }[];
  } | null,
) {
  return (
    !!actor &&
    (actor.isSuperAdmin ||
      !target ||
      (actor.id !== target.id &&
        !target.isSuperAdmin &&
        !target.roles.some((role) => role.slug === "admin")))
  );
}
