import { SetMetadata } from "@nestjs/common";
import type { v1 } from "@repo/api-shared";
export const ACCESS_POLICY = "accessPolicy";
export type AccessPolicy =
  | { kind: "self" }
  | { kind: "super" }
  | {
      kind: "permissions";
      keys: v1.access.PermissionKey[];
      scope?: v1.access.PermissionScope;
      match?: "any";
    };
export const SelfService = () =>
  SetMetadata(ACCESS_POLICY, { kind: "self" } satisfies AccessPolicy);
export const RequireSuperAdmin = () =>
  SetMetadata(ACCESS_POLICY, { kind: "super" } satisfies AccessPolicy);
export const RequirePermissions = (...keys: v1.access.PermissionKey[]) =>
  SetMetadata(ACCESS_POLICY, {
    kind: "permissions",
    keys,
  } satisfies AccessPolicy);
export const RequireAllScope = (...keys: v1.access.PermissionKey[]) =>
  SetMetadata(ACCESS_POLICY, {
    kind: "permissions",
    keys,
    scope: "ALL",
  } satisfies AccessPolicy);
/** For shared editor infrastructure; domain mutations still enforce their own grants. */
export const RequireAnyAllScope = (
  first: v1.access.PermissionKey,
  ...rest: v1.access.PermissionKey[]
) =>
  SetMetadata(ACCESS_POLICY, {
    kind: "permissions",
    keys: [first, ...rest],
    scope: "ALL",
    match: "any",
  } satisfies AccessPolicy);
