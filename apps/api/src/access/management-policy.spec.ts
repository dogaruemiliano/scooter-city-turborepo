import { ForbiddenException } from "@nestjs/common";
import {
  assertDelegable,
  assertManageableUser,
  requireManagementPermission,
} from "./management-policy";
import type { AccessSnapshot } from "./access.resolver";

const actor: AccessSnapshot = {
  userId: "admin",
  isSuperAdmin: false,
  effectiveScopes: {
    "users.read": ["ALL"],
    "users.roles.update": ["ALL"],
    "problems.read": ["ASSIGNED"],
  },
  accessRevision: 1,
  portalEligible: false,
  roleVersions: [],
};
const member = {
  id: "worker",
  isSuperAdmin: false,
  roleMemberships: [{ role: { slug: "mechanic", archivedAt: null } }],
};
describe("delegated access management", () => {
  it("requires an independent grant for each management action", () => {
    expect(() =>
      requireManagementPermission(actor, "users.read"),
    ).not.toThrow();
    expect(() => requireManagementPermission(actor, "roles.update")).toThrow(
      ForbiddenException,
    );
  });
  it("allows managing non-admin users", () =>
    expect(() => assertManageableUser(actor, member)).not.toThrow());
  it.each([
    { ...member, id: "admin" },
    { ...member, isSuperAdmin: true },
    {
      ...member,
      roleMemberships: [{ role: { slug: "admin", archivedAt: null } }],
    },
  ])("protects self and admin targets", (target) =>
    expect(() => assertManageableUser(actor, target)).toThrow(
      ForbiddenException,
    ),
  );
  it("never permits assigning Admin even when its grants are empty", () => {
    expect(() => assertDelegable(actor, {}, ["admin"])).toThrow(
      ForbiddenException,
    );
  });
  it.each(["users.read", "users.roles.update", "roles.read", "roles.update"])(
    "protects %s from indirect delegation",
    (key) => {
      expect(() => assertDelegable(actor, { [key]: ["ALL"] })).toThrow(
        ForbiddenException,
      );
    },
  );
  it("allows only scope subsets owned by the actor", () => {
    expect(() =>
      assertDelegable(actor, { "problems.read": ["ASSIGNED"] }),
    ).not.toThrow();
    expect(() => assertDelegable(actor, { "problems.read": ["ALL"] })).toThrow(
      ForbiddenException,
    );
    expect(() => assertDelegable(actor, { "persons.read": ["ALL"] })).toThrow(
      ForbiddenException,
    );
  });
  it("retains full Super Admin authority", () => {
    const superAdmin = { ...actor, isSuperAdmin: true };
    expect(() =>
      assertManageableUser(superAdmin, { ...member, isSuperAdmin: true }),
    ).not.toThrow();
    expect(() =>
      assertDelegable(superAdmin, { "roles.update": ["ALL"] }, ["admin"]),
    ).not.toThrow();
  });
});
