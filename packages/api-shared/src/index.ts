/**
 * Public barrel for `@repo/api-shared`.
 *
 * Single import pattern — always reach through the version namespace:
 *
 *   import { v1 } from "@repo/api-shared";
 *
 *   const cookie = v1.auth.ACCESS_TOKEN_COOKIE;
 *   const schema = v1.auth.refreshTokenInputSchema;
 *   const email  = v1.common.emailSchema;
 *   type User    = v1.auth.SessionUser;
 *
 * There are intentionally no flat top-level re-exports. Every consumer
 * names the version it depends on. When `v2/` lands, callers update at
 * their own pace by switching `v1.` to `v2.` at the call site.
 *
 * See `src/v1/README.md` for the folder convention and the rule that
 * versions are frozen at release.
 */
export * as v1 from "./v1";
