import { Ability, type RawRuleOf } from "@casl/ability";
import {
  accessibleBy,
  createPrismaAbility,
  type PrismaQueryOf,
  type Subjects,
  type WhereInputOf,
} from "@casl/prisma/runtime";
import { ForbiddenException } from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import type {
  Prisma,
  ScooterProblem,
  Scooter,
  Rental,
  Person,
  ScooterDocument,
} from "../generated/prisma/client";
import type { AccessSnapshot } from "./access.resolver";

type AppSubjects =
  | Subjects<{
      ScooterProblem: ScooterProblem;
      Scooter: Scooter;
      Rental: Rental;
      Person: Person;
      ScooterDocument: ScooterDocument;
    }>
  | "Application";
type PrismaQuery = PrismaQueryOf<Prisma.TypeMap>;
export type AppAbility = Ability<
  [v1.access.PermissionKey, AppSubjects],
  PrismaQuery
>;

// Keep the legacy single-assignee field readable during the rollout.
export const assignedProblemWhere = (
  userId: string,
): Prisma.ScooterProblemWhereInput => ({
  OR: [{ assigneeId: userId }, { assignees: { some: { id: userId } } }],
});
export const unassignedProblemWhere: Prisma.ScooterProblemWhereInput = {
  assigneeId: null,
  assignees: { none: {} },
};
export function subjectFor(
  key: v1.access.PermissionKey,
):
  | "ScooterProblem"
  | "Scooter"
  | "Rental"
  | "Person"
  | "ScooterDocument"
  | "Application" {
  if (key.startsWith("problems.")) return "ScooterProblem";
  if (key.startsWith("scooters.")) return "Scooter";
  if (key.includes("rentals.")) return "Rental";
  if (key === "portal.profile.read") return "Person";
  if (key.includes("scooter_documents.")) return "ScooterDocument";
  return "Application";
}
export function createAbility(
  snapshot: AccessSnapshot,
  now = new Date(),
): AppAbility {
  const rules: RawRuleOf<AppAbility>[] = [];
  for (const entry of v1.access.permissionCatalog) {
    const action = entry.key;
    const subject = subjectFor(action);
    if (action.startsWith("portal.") && !snapshot.portalEligible) continue;
    const scopes = snapshot.isSuperAdmin
      ? entry.scopes
      : (snapshot.effectiveScopes[action] ?? []);
    for (const scope of scopes) {
      let conditions: PrismaQuery | undefined;
      if (scope === "ASSIGNED" && subject === "ScooterProblem")
        conditions = assignedProblemWhere(snapshot.userId);
      else if (scope === "AVAILABLE" && subject === "ScooterProblem")
        conditions = { ...unassignedProblemWhere, status: "open" };
      else if (scope === "ASSIGNED" && subject === "Scooter")
        conditions = {
          problems: {
            some: {
              ...assignedProblemWhere(snapshot.userId),
              status: { in: ["open", "in_progress"] },
            },
          },
        };
      else if (scope === "OWN" && subject === "Rental")
        conditions = {
          person: {
            is: {
              userId: snapshot.userId,
              deletedAt: null,
              customerAccessEnabled: true,
              user: { is: { deletedAt: null, loginStatus: "ACTIVE" } },
            },
          },
        };
      else if (scope === "OWN" && subject === "Person")
        conditions = {
          userId: snapshot.userId,
          deletedAt: null,
          customerAccessEnabled: true,
          user: { is: { deletedAt: null, loginStatus: "ACTIVE" } },
        };
      else if (scope === "OWN" && subject === "ScooterDocument")
        conditions = {
          customerVisible: true,
          deletedAt: null,
          type: { in: ["registration_certificate", "insurance"] },
          asset: { is: { deletedAt: null } },
          scooter: {
            is: {
              deletedAt: null,
              rentals: {
                some: {
                  status: "active",
                  startsAt: { lte: now },
                  endsAt: { gt: now },
                  returnedAt: null,
                  person: {
                    is: {
                      userId: snapshot.userId,
                      deletedAt: null,
                      customerAccessEnabled: true,
                      user: { is: { deletedAt: null, loginStatus: "ACTIVE" } },
                    },
                  },
                },
              },
            },
          },
        };
      else if (scope !== "ALL") continue;
      rules.push({ action, subject, ...(conditions ? { conditions } : {}) });
    }
  }
  return createPrismaAbility<AppAbility>(rules);
}
/** Reject absent action grants before Prisma, including inside unextended transactions. */
export function accessibleWhere<
  T extends
    | "ScooterProblem"
    | "Scooter"
    | "Rental"
    | "Person"
    | "ScooterDocument",
>(
  snapshot: AccessSnapshot,
  key: v1.access.PermissionKey,
  model: T,
): WhereInputOf<Prisma.TypeMap, T> {
  const ability = createAbility(snapshot);
  if (subjectFor(key) !== model || !ability.can(key, model))
    throw new ForbiddenException("Permission required");
  return accessibleBy(ability, key).ofType(model);
}
