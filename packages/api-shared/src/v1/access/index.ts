import { z } from "zod";
import { normalizedEmailSchema } from "../common";

export const PERMISSION_SCOPES = [
  "OWN",
  "ASSIGNED",
  "AVAILABLE",
  "ALL",
] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];
export type EffectiveScopes = Record<string, PermissionScope[]>;
/** Super admin is a protected designation, not an assignable business role. */
export const BASE_ROLE_SLUGS = ["admin", "mechanic", "customer"] as const;
const all = ["ALL"] as const;
const definition = <K extends string>(
  key: K,
  scopes: readonly PermissionScope[] = all,
  prerequisites: string[] = [],
  scopePrerequisites: { key: string; anyOf: readonly PermissionScope[] }[] = [],
) => ({
  key,
  scopes,
  prerequisites,
  scopePrerequisites,
  labelKey: `access.permissions.${key}`,
  descriptionKey: `access.descriptions.${key}`,
});
export const permissionCatalog = [
  definition("users.read"),
  definition("users.invite", all, ["users.read"]),
  definition("users.status.update", all, ["users.read"]),
  definition("users.roles.update", all, ["users.read", "roles.read"]),
  definition("users.permissions.update", all, ["users.read", "roles.read"]),
  definition("roles.read"),
  definition("roles.update", all, ["roles.read"]),

  definition("persons.read"),
  definition("persons.create", all, ["persons.read"]),
  definition("persons.update", all, ["persons.read"]),
  definition("persons.archive", all, ["persons.read"]),
  definition("persons.audit.read", all, ["persons.read"]),
  definition("person_documents.read", all, ["persons.read"]),
  definition("person_documents.write", all, ["person_documents.read"]),
  definition("person_documents.delete", all, ["person_documents.read"]),
  definition("person_documents.extract", all, ["person_documents.write"]),
  definition("scooters.read", ["ASSIGNED", "ALL"]),
  definition("scooters.create", all, [
    "scooters.read",
    "scooter_brands.read",
    "vehicle_civ.read",
  ]),
  definition("scooters.update", all, [
    "scooters.read",
    "scooter_brands.read",
    "vehicle_civ.read",
  ]),
  definition("scooters.archive", all, ["scooters.read"]),
  definition("scooter_documents.read", all, ["scooters.read"]),
  definition("scooter_documents.write", all, ["scooter_documents.read"]),
  definition("scooter_documents.extract", all, ["scooter_documents.write"]),
  definition("scooter_brands.read"),
  definition("scooter_brands.manage", all, ["scooter_brands.read"]),
  definition("vehicle_civ.read"),
  definition("finance.books.read"),
  definition("finance.suppliers.read", all, ["finance.books.read"]),
  definition("finance.accounts.read", all, ["finance.books.read"]),
  definition("finance.operations.read", all, ["finance.books.read"]),
  definition("finance.reference.read", all, ["finance.books.read"]),
  definition("finance.suppliers.manage", all, ["finance.suppliers.read"]),
  definition("finance.expenses.create", all, [
    "finance.suppliers.read",
    "finance.accounts.read",
    "finance.operations.read",
    "finance.reference.read",
  ]),
  definition("finance.funding.create", all, [
    "finance.accounts.read",
    "finance.operations.read",
  ]),
  definition("finance.operations.reverse", all, ["finance.operations.read"]),
  definition("finance.settlements.preview", all, [
    "finance.accounts.read",
    "finance.operations.read",
  ]),
  definition("problems.read", ["ASSIGNED", "AVAILABLE", "ALL"]),
  definition("problems.create", all, ["problems.read", "scooters.read"]),
  definition("problems.update", ["ASSIGNED", "ALL"], ["problems.read"]),
  definition("problems.resolve", ["ASSIGNED", "ALL"], ["problems.read"]),
  definition(
    "problems.claim",
    ["AVAILABLE"],
    ["problems.read", "problems.update"],
    [
      { key: "problems.read", anyOf: ["AVAILABLE", "ALL"] },
      { key: "problems.read", anyOf: ["ASSIGNED", "ALL"] },
      { key: "problems.update", anyOf: ["ASSIGNED", "ALL"] },
    ],
  ),
  definition("problems.assign", all, ["problems.read"]),
  definition("problems.prioritize", all, ["problems.read"]),
  definition("problems.reopen", all, ["problems.read"]),
  definition("portal.profile.read", ["OWN"]),
  definition("portal.rentals.read", ["OWN"], ["portal.profile.read"]),
  definition("portal.scooter_documents.read", ["OWN"], ["portal.rentals.read"]),
  definition("rentals.read", all, ["persons.read", "scooters.read"]),
  definition("rentals.create", all, ["rentals.read"]),
  definition("rentals.handover", all, ["rentals.read"]),
  definition("rentals.return", all, ["rentals.read"]),
] as const;
export type PermissionKey = (typeof permissionCatalog)[number]["key"];
export const permissionKeys = permissionCatalog.map((p) => p.key);
export const permissionKeySchema = z.enum(permissionKeys);
export const permissionScopeSchema = z.enum(PERMISSION_SCOPES);
export const effectiveScopesSchema = z.record(
  z.string(),
  z.array(permissionScopeSchema),
);
export const roleVersionSchema = z.object({
  id: z.string(),
  revision: z.number().int(),
});
export const grantSchema = z
  .object({
    permissionKey: permissionKeySchema,
    scopes: z.array(permissionScopeSchema),
  })
  .strict();
export const overrideSchema = grantSchema.extend({
  reason: z.string().trim().max(500).nullable().optional(),
});
export const userAccessInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    roles: z.array(roleVersionSchema).max(1),
    overrides: z.array(overrideSchema).max(100),
  })
  .strict()
  .meta({ id: "UserAccessInput" });
export type UserAccessInput = z.infer<typeof userAccessInputSchema>;
export const createUserInputSchema = z
  .object({
    email: normalizedEmailSchema,
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    roles: z.array(roleVersionSchema).max(1),
    overrides: z.array(overrideSchema).max(100),
  })
  .strict()
  .meta({ id: "CreateAccessUserInput" });
export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export const createRoleInputSchema = z
  .object({
    slug: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1000).default(""),
    permissions: z.array(grantSchema).max(100),
  })
  .strict()
  .meta({ id: "CreateAccessRoleInput" });
export const updateRoleInputSchema = createRoleInputSchema
  .omit({ slug: true })
  .extend({ expectedRevision: z.number().int().positive() })
  .meta({ id: "UpdateAccessRoleInput" });
export type CreateRoleInput = z.infer<typeof createRoleInputSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleInputSchema>;
export const revisionInputSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict()
  .meta({ id: "AccessRevisionInput" });
export const statusInputSchema = revisionInputSchema
  .extend({ status: z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]) })
  .meta({ id: "AccessStatusInput" });
export const superAdminInputSchema = revisionInputSchema
  .extend({ isSuperAdmin: z.boolean() })
  .meta({ id: "SuperAdminInput" });
export const customerAccessInputSchema = revisionInputSchema
  .extend({ enabled: z.boolean() })
  .meta({ id: "CustomerAccessInput" });
export const roleSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    revision: z.number(),
    archivedAt: z.string().nullable(),
    memberCount: z.number(),
    permissions: z.array(grantSchema),
  })
  .meta({ id: "AccessRole" });
export type Role = z.infer<typeof roleSchema>;
export const invitationSchema = z.object({
  id: z.string(),
  generation: z.number(),
  expiresAt: z.string(),
  activatedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  deliveryStatus: z.enum(["PENDING", "SENT", "FAILED"]),
});
export const accessUserSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    loginStatus: z.enum(["DISABLED", "INVITED", "ACTIVE", "SUSPENDED"]),
    isSuperAdmin: z.boolean(),
    accessRevision: z.number(),
    deletedAt: z.string().nullable(),
    roles: z.array(roleSchema),
    overrides: z.array(overrideSchema),
    effectiveScopes: effectiveScopesSchema,
    portalEligible: z.boolean(),
    personId: z.string().nullable(),
    invitation: invitationSchema.nullable(),
  })
  .meta({ id: "AccessUser" });
export type AccessUser = z.infer<typeof accessUserSchema>;
export const accessPreviewSchema = z
  .object({
    before: effectiveScopesSchema,
    after: effectiveScopesSchema,
    missingPrerequisites: z.array(z.string()),
  })
  .meta({ id: "AccessPreview" });
export const rolePreviewSchema = z
  .object({
    memberCount: z.number(),
    affectedMembers: z.array(
      z.object({
        id: z.string(),
        email: z.string(),
        before: effectiveScopesSchema,
        after: effectiveScopesSchema,
        missingPrerequisites: z.array(z.string()),
      }),
    ),
  })
  .meta({ id: "RoleAccessPreview" });
export const roleListSchema = z
  .object({ items: z.array(roleSchema) })
  .meta({ id: "AccessRoleList" });
export const accessUserListSchema = z
  .object({ items: z.array(accessUserSchema), total: z.number() })
  .meta({ id: "AccessUserList" });

/** Capabilities are fresh /me data. JWT role claims are never authorization. */
export function hasPermission(
  user:
    | {
        isSuperAdmin?: boolean;
        effectiveScopes?: EffectiveScopes;
        portalEligible?: boolean;
      }
    | null
    | undefined,
  key: PermissionKey,
  scope?: PermissionScope,
): boolean {
  if (!user || (key.startsWith("portal.") && !user.portalEligible))
    return false;
  return (
    !!user.isSuperAdmin ||
    !!user.effectiveScopes?.[key]?.some(
      (s) => !scope || s === "ALL" || s === scope,
    )
  );
}

export const accessAuditListSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        createdAt: z.string(),
        userId: z.string().nullable(),
        meta: z.unknown(),
      }),
    ),
  })
  .meta({ id: "AccessAuditList" });

export {
  permissionRequirements,
  requirementSatisfied,
  missingPermissionPrerequisites,
} from "./dependencies";
