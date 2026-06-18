import type { v1 } from "@repo/api-shared";

export type SessionIdentity = Pick<
  v1.auth.SessionUser,
  "id" | "email" | "roles"
>;
