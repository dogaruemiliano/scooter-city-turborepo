import type { v1 } from "@repo/api-shared";

export type SessionIdentity = Pick<
  v1.auth.SessionUser,
  "id" | "email" | "roles"
> & {
  firstName?: v1.auth.SessionUser["firstName"];
  lastName?: v1.auth.SessionUser["lastName"];
};

export function toSessionIdentity(user: v1.auth.SessionUser): SessionIdentity {
  return {
    id: user.id,
    email: user.email,
    roles: user.roles,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}
