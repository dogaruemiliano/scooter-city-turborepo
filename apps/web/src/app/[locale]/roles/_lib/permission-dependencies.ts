import { v1 } from "@repo/api-shared";

type Scope = v1.access.PermissionScope;
type Key = v1.access.PermissionKey;
export type PermissionChange = { permissionKey: Key; scopes: Scope[] };
const normalize = (scopes: readonly Scope[]) =>
  scopes.includes("ALL")
    ? ["ALL" as const]
    : v1.access.PERMISSION_SCOPES.filter((scope) => scopes.includes(scope));

/** Adds only the requirements of this permission, keeping existing access intact. */
export function planRequiredPermissions(
  key: Key,
  before: v1.access.EffectiveScopes,
) {
  const after = { ...before };
  const visited = new Set<Key>();
  const queue: Key[] = [key];
  const unresolved = new Set<Key>();
  for (
    let step = 0;
    queue.length && step < v1.access.permissionCatalog.length ** 2;
    step++
  ) {
    const current = queue.shift()!;
    visited.add(current);
    for (const requirement of v1.access.permissionRequirements(
      current,
      after[current] ?? [],
    )) {
      if (!v1.access.requirementSatisfied(requirement, after)) {
        const entry = v1.access.permissionCatalog.find(
          (item) => item.key === requirement.key,
        )!;
        const choice = v1.access.PERMISSION_SCOPES.find(
          (scope) =>
            requirement.anyOf.includes(scope) &&
            entry.scopes.some((allowed) => allowed === scope),
        );
        if (!choice) {
          unresolved.add(requirement.key);
          continue;
        }
        after[requirement.key] = normalize([
          ...(after[requirement.key] ?? []),
          choice,
        ]);
        // A broader requirement must be propagated even if this node was visited.
        queue.push(requirement.key);
      } else if (!visited.has(requirement.key)) queue.push(requirement.key);
    }
  }
  const changes: PermissionChange[] = v1.access.permissionCatalog.flatMap(
    ({ key: changed }) =>
      JSON.stringify(normalize(before[changed] ?? [])) ===
      JSON.stringify(normalize(after[changed] ?? []))
        ? []
        : [{ permissionKey: changed, scopes: after[changed] ?? [] }],
  );
  for (const current of visited) {
    for (const requirement of v1.access.permissionRequirements(
      current,
      after[current] ?? [],
    )) {
      if (!v1.access.requirementSatisfied(requirement, after))
        unresolved.add(requirement.key);
    }
  }
  return { changes, unresolved: [...unresolved] };
}

/** Cascades only newly broken requirements along the changed permission's graph. */
export function planDependentDisables(
  key: Key,
  before: v1.access.EffectiveScopes,
  proposed: v1.access.EffectiveScopes,
): PermissionChange[] {
  const previous = normalize(before[key] ?? []);
  const next = normalize(proposed[key] ?? []);
  // Adding access cannot break an existing dependency. Only inspect scope loss.
  if (previous.every((scope) => next.includes("ALL") || next.includes(scope)))
    return [];
  const after = { ...proposed };
  const changed = new Set<Key>([key]);
  const result: PermissionChange[] = [];
  for (let step = 0; step < v1.access.permissionCatalog.length; step++) {
    let found = false;
    for (const permission of v1.access.permissionCatalog) {
      if (changed.has(permission.key) || !after[permission.key]?.length)
        continue;
      const broken = v1.access
        .permissionRequirements(permission.key, after[permission.key] ?? [])
        .some(
          (requirement) =>
            changed.has(requirement.key) &&
            !v1.access.requirementSatisfied(requirement, after),
        );
      if (broken) {
        after[permission.key] = [];
        changed.add(permission.key);
        result.push({ permissionKey: permission.key, scopes: [] });
        found = true;
      }
    }
    if (!found) break;
  }
  return result;
}
