import { v1 } from "@repo/api-shared";

export interface GrantRow {
  permissionKey: string;
  scopes: readonly string[];
}
export interface AccessSnapshot {
  userId: string;
  isSuperAdmin: boolean;
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
  const missing = new Set<string>();
  for (const entry of v1.access.permissionCatalog) {
    const granted = scopes[entry.key];
    if (!granted?.length) continue;
    for (const dependency of entry.prerequisites) {
      const required = scopes[dependency] ?? [];
      if (
        !required.length ||
        (granted.includes("ALL") && !required.includes("ALL"))
      )
        missing.add(`${entry.key}: ${dependency}`);
      if (
        entry.key.startsWith("problems.") &&
        granted.includes("ASSIGNED") &&
        !required.includes("ASSIGNED") &&
        !required.includes("ALL")
      )
        missing.add(`${entry.key}: ${dependency}:ASSIGNED`);
    }
    for (const dependency of entry.scopePrerequisites) {
      const required = scopes[dependency.key] ?? [];
      if (!dependency.anyOf.some((scope) => required.includes(scope)))
        missing.add(
          `${entry.key}: ${dependency.key}:${dependency.anyOf.join("|")}`,
        );
    }
  }
  return [...missing].sort();
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
