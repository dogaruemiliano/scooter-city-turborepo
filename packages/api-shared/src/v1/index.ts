/**
 * `v1` barrel — every type, schema, and constant scoped to the `/v1/*`
 * API surface. Domain folders are imported as namespaces so call sites
 * are explicit about which domain they're using:
 *
 *   import { v1 } from "@repo/api-shared";
 *   const s = v1.auth.refreshTokensSchema;
 *   const e = v1.common.emailSchema;
 *
 * When a `v2/` is added, prefer re-exporting unchanged domains from `v1`
 * (e.g. `export * as common from "../v1/common"`) rather than copying
 * files; only fork a domain when its contract genuinely changes.
 */
export * as auth from "./auth";
export * as common from "./common";
export * as users from "./users";
