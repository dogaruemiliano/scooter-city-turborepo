import assert from "node:assert/strict";
import test from "node:test";
import { v1 } from "../src";

test("access requests accept at most one base role", () => {
  assert.deepEqual(v1.access.BASE_ROLE_SLUGS, [
    "admin",
    "mechanic",
    "customer",
  ]);
  const roles = [
    { id: "mechanic", revision: 1 },
    { id: "customer", revision: 1 },
  ];
  assert.equal(
    v1.access.createUserInputSchema.safeParse({
      email: "member@example.test",
      roles,
      overrides: [],
    }).success,
    false,
  );
  assert.equal(
    v1.access.userAccessInputSchema.safeParse({
      expectedRevision: 1,
      roles,
      overrides: [],
    }).success,
    false,
  );
  assert.equal(
    v1.access.userAccessInputSchema.safeParse({
      expectedRevision: 1,
      roles: roles.slice(0, 1),
      overrides: [],
    }).success,
    true,
  );
});

test("user provisioning normalizes email and rejects protected grant names", () => {
  const input = { email: "  Mechanic@Example.com  ", roles: [], overrides: [] };
  assert.equal(
    v1.access.createUserInputSchema.parse(input).email,
    "mechanic@example.com",
  );
  assert.equal(
    v1.access.createUserInputSchema.safeParse({
      ...input,
      overrides: [{ permissionKey: "finance.company.manage", scopes: ["ALL"] }],
    }).success,
    false,
  );
});
test("full access replacement distinguishes no override from an explicit empty override", () => {
  const base = { expectedRevision: 1, roles: [] };
  assert.equal(v1.access.userAccessInputSchema.safeParse(base).success, false);
  assert.deepEqual(
    v1.access.userAccessInputSchema.parse({ ...base, overrides: [] }).overrides,
    [],
  );
  assert.deepEqual(
    v1.access.userAccessInputSchema.parse({
      ...base,
      overrides: [{ permissionKey: "problems.read", scopes: [] }],
    }).overrides,
    [{ permissionKey: "problems.read", scopes: [] }],
  );
});
test("portal capability hints require eligibility even for a super admin", () => {
  assert.equal(
    v1.access.hasPermission(
      { isSuperAdmin: true, portalEligible: false },
      "portal.rentals.read",
    ),
    false,
  );
  assert.equal(
    v1.access.hasPermission(
      { effectiveScopes: { "problems.read": ["ASSIGNED"] } },
      "problems.read",
      "ALL",
    ),
    false,
  );
});
