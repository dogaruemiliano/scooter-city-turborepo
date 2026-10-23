import { v1 } from "@repo/api-shared";

export interface GrantRow {
  permissionKey: string;
  scopes: readonly string[];
}
export interface AccessSnapshot {
  userId: string;
  isSuperAdmin: boolean;
  isAdmin?: boolean;
  effectiveScopes: v1.access.EffectiveScopes;
  accessRevision: number;
  portalEligible: boolean;
  roleVersions: { id: string; revision: number }[];
}
export const catalogByKey = new Map<
  string,
  (typeof v1.access.permissionCatalog)[number]
>(v1.access.permissionCatalog.map((p) => [p.key, p]));
export function normalizeScopes(
  scopes: readonly string[],
): v1.access.PermissionScope[] {
  return scopes.includes("ALL")
    ? ["ALL"]
    : v1.access.PERMISSION_SCOPES.filter((s) => scopes.includes(s));
}
export function validGrant(row: GrantRow): boolean {
  const entry = catalogByKey.get(row.permissionKey);
  return (
    !!entry &&
    row.scopes.every((s) => (entry.scopes as readonly string[]).includes(s))
  );
}
export function resolveScopes(
  roleGrants: readonly GrantRow[],
  overrides: readonly GrantRow[],
): v1.access.EffectiveScopes {
  const result: v1.access.EffectiveScopes = {};
  for (const row of roleGrants) {
    if (validGrant(row))
      result[row.permissionKey] = normalizeScopes([
        ...(result[row.permissionKey] ?? []),
        ...row.scopes,
      ]);
  }
  for (const row of overrides) {
    // A corrupt restriction must never restore a broader role grant.
    if (catalogByKey.has(row.permissionKey))
      result[row.permissionKey] = validGrant(row)
        ? normalizeScopes(row.scopes)
        : [];
  }
  return result;
}
export function missingPrerequisites(
  scopes: v1.access.EffectiveScopes,
): string[] {
  return v1.access.missingPermissionPrerequisites(scopes);
}
/** Remove invalid dependency chains at runtime, never add implied grants. */
export function enforcePrerequisites(
  scopes: v1.access.EffectiveScopes,
): v1.access.EffectiveScopes {
  const result = { ...scopes };
  for (let i = 0; i < v1.access.permissionCatalog.length; i++) {
    const bad = missingPrerequisites(result);
    if (!bad.length) break;
    for (const value of bad) result[value.split(":")[0]] = [];
  }
  return result;
}
