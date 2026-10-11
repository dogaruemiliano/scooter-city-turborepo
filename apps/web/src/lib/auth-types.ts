import type { v1 } from "@repo/api-shared";
import type { AccessIdentity } from "./access";

export type SessionIdentity = Pick<
  v1.auth.SessionUser,
  "id" | "email" | "roles"
> &
  AccessIdentity & {
    accessRevision?: number;
    roleVersions?: { id: string; revision: number }[];
    firstName?: v1.auth.SessionUser["firstName"];
    lastName?: v1.auth.SessionUser["lastName"];
  };

export function toSessionIdentity(user: v1.auth.SessionUser): SessionIdentity {
  return {
    ...user,
    id: user.id,
    email: user.email,
    roles: user.roles,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}
