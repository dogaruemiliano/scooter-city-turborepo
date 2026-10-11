import { v1 } from "@repo/api-shared";
import {
  enforcePrerequisites,
  missingPrerequisites,
  normalizeScopes,
  resolveScopes,
} from "./access.resolver";
const grant = (permissionKey: string, ...scopes: string[]) => ({
  permissionKey,
  scopes,
});
describe("live role and override policy matrix", () => {
  it("denies no-role users", () => expect(resolveScopes([], [])).toEqual({}));
  it("unions role scopes, normalizes duplicates and ALL", () => {
    expect(
      resolveScopes(
        [
          grant("problems.read", "ASSIGNED"),
          grant("problems.read", "AVAILABLE", "ASSIGNED"),
        ],
        [],
      ),
    ).toEqual({ "problems.read": ["ASSIGNED", "AVAILABLE"] });
    expect(normalizeScopes(["ASSIGNED", "ALL", "ALL"])).toEqual(["ALL"]);
  });
  it.each([
    [["ALL"], ["ASSIGNED"]],
    [["ASSIGNED"], ["ALL"]],
    [["ALL"], []],
  ])("replaces %p with %p", (inherited, override) =>
    expect(
      resolveScopes(
        [grant("problems.read", ...inherited)],
        [grant("problems.read", ...override)],
      )["problems.read"],
    ).toEqual(override),
  );
  it("keeps unrelated inheritance and direct grants after role removal", () => {
    expect(
      resolveScopes(
        [grant("persons.read", "ALL")],
        [grant("problems.read", "ASSIGNED")],
      ),
    ).toEqual({ "persons.read": ["ALL"], "problems.read": ["ASSIGNED"] });
    expect(
      resolveScopes([], [grant("problems.read", "ASSIGNED")])["problems.read"],
    ).toEqual(["ASSIGNED"]);
  });
  it("reset restores live roles; empty overrides block future roles", () => {
    expect(
      resolveScopes([grant("problems.read", "ALL")], [])["problems.read"],
    ).toEqual(["ALL"]);
    expect(
      resolveScopes([grant("problems.read", "ALL")], [grant("problems.read")])[
        "problems.read"
      ],
    ).toEqual([]);
  });
  it("corrupt override denies without restoring inherited grant", () =>
    expect(
      resolveScopes(
        [grant("problems.read", "ALL")],
        [grant("problems.read", "UNKNOWN")],
      )["problems.read"],
    ).toEqual([]));
  it("unknown/protected keys and unsupported scopes cannot authorize", () =>
    expect(
      resolveScopes(
        [
          grant("finance.company.manage", "ALL"),
          grant("persons.read", "OWN"),
          grant("manage", "ALL"),
        ],
        [],
      ),
    ).toEqual({}));
  it("missing prerequisites deny cascading dependent actions without widening", () => {
    const grants = {
      "person_documents.extract": ["ALL"],
      "person_documents.write": ["ALL"],
    } as v1.access.EffectiveScopes;
    expect(missingPrerequisites(grants)).toContain(
      "person_documents.write: person_documents.read",
    );
    expect(enforcePrerequisites(grants)).toEqual({
      "person_documents.extract": [],
      "person_documents.write": [],
    });
  });
  it("explicit empty scopes survive schema validation; omitted scopes are rejected", () => {
    expect(v1.access.overrideSchema.parse(grant("problems.read"))).toEqual(
      grant("problems.read"),
    );
    expect(
      v1.access.overrideSchema.safeParse({ permissionKey: "problems.read" })
        .success,
    ).toBe(false);
  });
});
