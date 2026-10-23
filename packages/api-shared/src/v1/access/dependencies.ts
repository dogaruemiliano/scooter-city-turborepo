import {
  permissionCatalog,
  PERMISSION_SCOPES,
  type EffectiveScopes,
  type PermissionKey,
  type PermissionScope,
} from "./index";

export type PermissionRequirement = {
  key: PermissionKey;
  anyOf: readonly PermissionScope[];
  /** Keeps the API's existing dependency error format stable. */
  suffix?: string;
};

/** Requirements for an enabled permission, including the scope coverage rules. */
export function permissionRequirements(
  key: PermissionKey,
  granted: readonly PermissionScope[],
): PermissionRequirement[] {
  if (!granted.length) return [];
  const entry = permissionCatalog.find((item) => item.key === key)!;
  const result: PermissionRequirement[] = [];
  for (const dependency of entry.prerequisites) {
    result.push({
      key: dependency as PermissionKey,
      anyOf: granted.includes("ALL") ? ["ALL"] : PERMISSION_SCOPES,
    });
    if (key.startsWith("problems.") && granted.includes("ASSIGNED")) {
      result.push({
        key: dependency as PermissionKey,
        anyOf: ["ASSIGNED", "ALL"],
        suffix: "ASSIGNED",
      });
    }
  }
  for (const dependency of entry.scopePrerequisites) {
    result.push({
      key: dependency.key as PermissionKey,
      anyOf: dependency.anyOf,
      suffix: dependency.anyOf.join("|"),
    });
  }
  return result;
}

export function requirementSatisfied(
  requirement: PermissionRequirement,
  scopes: EffectiveScopes,
): boolean {
  return requirement.anyOf.some((scope) =>
    scopes[requirement.key]?.includes(scope),
  );
}

export function missingPermissionPrerequisites(
  scopes: EffectiveScopes,
): string[] {
  const missing = new Set<string>();
  for (const entry of permissionCatalog) {
    for (const requirement of permissionRequirements(
      entry.key,
      scopes[entry.key] ?? [],
    )) {
      if (!requirementSatisfied(requirement, scopes)) {
        missing.add(
          `${entry.key}: ${requirement.key}${requirement.suffix ? `:${requirement.suffix}` : ""}`,
        );
      }
    }
  }
  return [...missing].sort();
}
