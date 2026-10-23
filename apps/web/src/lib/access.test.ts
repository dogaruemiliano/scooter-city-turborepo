import { describe, expect, it } from "vitest";
import { canAccess, canVisit } from "./access";
describe("current user capabilities", () => {
  it("exposes delegated administration pages from their independent read grants", () => {
    const manager = {
      effectiveScopes: { "users.read": ["ALL"], "roles.read": ["ALL"] },
    };
    expect(canVisit(manager, "/users")).toBe(true);
    expect(canVisit(manager, "/roles")).toBe(true);
    expect(
      canVisit({ effectiveScopes: { "users.read": ["ALL"] } }, "/roles"),
    ).toBe(false);
  });

  it("never uses legacy role names as authority", () => {
    expect(
      canAccess(
        { effectiveScopes: {}, ...{ roles: ["ADMIN", "SUPER_ADMIN"] } },
        "persons.read",
      ),
    ).toBe(false);
  });
  it("checks the requested scope without widening assigned access", () => {
    const user = { effectiveScopes: { "problems.resolve": ["ASSIGNED"] } };
    expect(canAccess(user, "problems.resolve", "ASSIGNED")).toBe(true);
    expect(canAccess(user, "problems.resolve", "ALL")).toBe(false);
  });
  it("keeps assigned mechanics outside the full fleet screen", () => {
    expect(
      canVisit(
        { effectiveScopes: { "scooters.read": ["ASSIGNED"] } },
        "/scooters",
      ),
    ).toBe(false);
    expect(
      canVisit({ effectiveScopes: { "scooters.read": ["ALL"] } }, "/scooters"),
    ).toBe(true);
  });
  it("gates customer navigation on eligibility even for a super admin", () => {
    expect(
      canVisit({ isSuperAdmin: true, portalEligible: false }, "/my-rentals"),
    ).toBe(false);
    expect(
      canVisit(
        {
          portalEligible: true,
          effectiveScopes: { "portal.rentals.read": ["OWN"] },
        },
        "/my-rentals",
      ),
    ).toBe(true);
  });
  it("separates role management from operational access", () => {
    expect(
      canVisit({ effectiveScopes: { "persons.read": ["ALL"] } }, "/users"),
    ).toBe(false);
    expect(canVisit({ isSuperAdmin: true }, "/roles")).toBe(true);
  });
});
