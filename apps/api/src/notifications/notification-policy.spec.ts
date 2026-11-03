import type { AccessSnapshot } from "../access/access.resolver";
import {
  activityEventWhere,
  notificationEventWhere,
  canReceiveRemovalNotice,
} from "./notification-policy";

const admin: AccessSnapshot = {
  userId: "admin-1",
  isSuperAdmin: false,
  isAdmin: true,
  effectiveScopes: {
    "notifications.receive": ["ALL"],
    "notifications.activity.read": ["ALL"],
    "finance.books.read": ["ALL"],
    "finance.operations.read": ["ALL"],
    "persons.read": ["ALL"],
  },
  accessRevision: 1,
  portalEligible: false,
  roleVersions: [],
};

describe("notification source-policy boundaries", () => {
  it("does not turn finance read grants or Admin designation into super-admin configuration access", () => {
    expect(JSON.stringify(activityEventWhere(admin))).not.toContain(
      "super_admin",
    );
    expect(JSON.stringify(notificationEventWhere(admin))).not.toContain(
      "super_admin",
    );
  });

  it("allows the protected source marker only for a live super-admin designation", () => {
    expect(
      JSON.stringify(activityEventWhere({ ...admin, isSuperAdmin: true })),
    ).toContain("super_admin");
    expect(
      JSON.stringify(activityEventWhere({ ...admin, isSuperAdmin: false })),
    ).not.toContain("super_admin");
  });

  it("does not let assigned-work subscriptions inherit unrelated business notifications", () => {
    const mechanic: AccessSnapshot = {
      ...admin,
      isAdmin: false,
      effectiveScopes: {
        ...admin.effectiveScopes,
        "notifications.receive": ["ASSIGNED"],
        "problems.read": ["ASSIGNED"],
      },
    };
    const filter = JSON.stringify(notificationEventWhere(mechanic));
    expect(filter).toContain("issue");
    expect(filter).not.toContain("persons.read");
    expect(filter).not.toContain("finance.operations.read");
    expect(filter).not.toContain("todo");
  });

  it("stops even generic unassignment notices after notification or problem access is removed", () => {
    const assigned = {
      ...admin,
      isAdmin: false,
      effectiveScopes: {
        "notifications.receive": ["ASSIGNED"],
        "problems.read": ["ASSIGNED"],
      },
    } as AccessSnapshot;
    expect(canReceiveRemovalNotice(assigned)).toBe(true);
    expect(
      canReceiveRemovalNotice({
        ...assigned,
        effectiveScopes: { "problems.read": ["ASSIGNED"] },
      }),
    ).toBe(false);
    expect(
      canReceiveRemovalNotice({
        ...assigned,
        effectiveScopes: { "notifications.receive": ["ASSIGNED"] },
      }),
    ).toBe(false);
  });
});
