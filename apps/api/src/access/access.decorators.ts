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
