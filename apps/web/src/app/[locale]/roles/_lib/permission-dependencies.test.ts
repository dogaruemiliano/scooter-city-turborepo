import { describe, expect, it } from "vitest";
import { v1 } from "@repo/api-shared";
import {
  planDependentDisables,
  planRequiredPermissions,
} from "./permission-dependencies";

const applied = (
  before: v1.access.EffectiveScopes,
  changes: ReturnType<typeof planRequiredPermissions>["changes"],
) => ({
  ...before,
  ...Object.fromEntries(
    changes.map((change) => [change.permissionKey, change.scopes]),
  ),
});

describe("permission dependency plans", () => {
  it("produces valid prerequisite closure for every supported permission scope", () => {
    for (const permission of v1.access.permissionCatalog) {
      for (const scope of permission.scopes) {
        const before: v1.access.EffectiveScopes = { [permission.key]: [scope] };
        const plan = planRequiredPermissions(permission.key, before);
        expect(plan.unresolved, `${permission.key}:${scope}`).toEqual([]);
        expect(
          v1.access.missingPermissionPrerequisites(
            applied(before, plan.changes),
          ),
          `${permission.key}:${scope}`,
        ).toEqual([]);
        for (const change of plan.changes) {
          const definition = v1.access.permissionCatalog.find(
            (item) => item.key === change.permissionKey,
          )!;
          expect(
            change.scopes.every((value) =>
              definition.scopes.some((allowed) => allowed === value),
            ),
          ).toBe(true);
        }
      }
    }
  });

  it("enables transitive prerequisites using only supported scopes", () => {
    const before: v1.access.EffectiveScopes = {
      "person_documents.extract": ["ALL"],
    };
    const plan = planRequiredPermissions("person_documents.extract", before);
    expect(plan.unresolved).toEqual([]);
    expect(plan.changes.map((change) => change.permissionKey).sort()).toEqual([
      "person_documents.read",
      "person_documents.write",
      "persons.read",
    ]);
    expect(
      v1.access.missingPermissionPrerequisites(applied(before, plan.changes)),
    ).toEqual([]);
    expect(before).toEqual({ "person_documents.extract": ["ALL"] });
  });

  it("chooses assigned instead of all when that satisfies the requested action", () => {
    const plan = planRequiredPermissions("problems.resolve", {
      "problems.resolve": ["ASSIGNED"],
    });
    expect(plan.changes).toEqual([
      { permissionKey: "problems.read", scopes: ["ASSIGNED"] },
    ]);
  });

  it("propagates all-record coverage and leaves unrelated and sufficient grants alone", () => {
    const before: v1.access.EffectiveScopes = {
      "problems.resolve": ["ALL"],
      "problems.read": ["ASSIGNED"],
      "persons.read": ["ALL"],
    };
    const plan = planRequiredPermissions("problems.resolve", before);
    expect(plan.changes).toEqual([
      { permissionKey: "problems.read", scopes: ["ALL"] },
    ]);
    expect(
      planRequiredPermissions("problems.resolve", applied(before, plan.changes))
        .changes,
    ).toEqual([]);
  });

  it("combines assigned and available requirements for claiming work", () => {
    const before: v1.access.EffectiveScopes = {
      "problems.claim": ["AVAILABLE"],
      "problems.read": ["AVAILABLE"],
    };
    const plan = planRequiredPermissions("problems.claim", before);
    const after = applied(before, plan.changes);
    expect(after["problems.read"]).toEqual(["ASSIGNED", "AVAILABLE"]);
    expect(after["problems.update"]).toEqual(["ASSIGNED"]);
    expect(v1.access.missingPermissionPrerequisites(after)).toEqual([]);
  });

  it("does not disable an already-invalid dependent when adding access", () => {
    const before: v1.access.EffectiveScopes = {
      "problems.read": [],
      "problems.resolve": ["ALL"],
    };
    expect(
      planDependentDisables("problems.read", before, {
        ...before,
        "problems.read": ["ASSIGNED"],
      }),
    ).toEqual([]);
  });

  it("does nothing for an action that is off", () => {
    expect(planRequiredPermissions("problems.resolve", {}).changes).toEqual([]);
  });

  it("disables the full downstream chain without touching unrelated grants", () => {
    const before: v1.access.EffectiveScopes = {
      "persons.read": ["ALL"],
      "person_documents.read": ["ALL"],
      "person_documents.write": ["ALL"],
      "person_documents.extract": ["ALL"],
      "scooters.read": ["ALL"],
    };
    const changes = planDependentDisables("persons.read", before, {
      ...before,
      "persons.read": [],
    });
    expect(changes.map((change) => change.permissionKey).sort()).toEqual([
      "person_documents.extract",
      "person_documents.read",
      "person_documents.write",
    ]);
    expect(
      v1.access.missingPermissionPrerequisites(
        applied({ ...before, "persons.read": [] }, changes),
      ),
    ).toEqual([]);
  });

  it("detects scope narrowing and preserves dependents covered by the narrower scope", () => {
    const before: v1.access.EffectiveScopes = {
      "problems.read": ["ALL"],
      "problems.update": ["ALL"],
      "problems.resolve": ["ASSIGNED"],
      "problems.claim": ["AVAILABLE"],
    };
    expect(
      planDependentDisables("problems.read", before, {
        ...before,
        "problems.read": ["ASSIGNED"],
      })
        .map((change) => change.permissionKey)
        .sort(),
    ).toEqual(["problems.claim", "problems.update"]);
  });

  it("ignores unrelated invalid grants and edits that leave effective scopes unchanged", () => {
    const before: v1.access.EffectiveScopes = {
      "problems.read": ["ASSIGNED"],
      "problems.resolve": ["ALL"],
      "person_documents.write": ["ALL"],
    };
    expect(planDependentDisables("problems.read", before, before)).toEqual([]);
    expect(
      planDependentDisables("problems.read", before, {
        ...before,
        "problems.read": [],
      }),
    ).toEqual([{ permissionKey: "problems.resolve", scopes: [] }]);
  });
});
