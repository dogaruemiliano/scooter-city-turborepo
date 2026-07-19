/**
 * Prisma 7 client wired as an injectable NestJS service.
 *
 * Follows the canonical Prisma 7 pattern documented in
 * [`AGENTS.md`](../../../../AGENTS.md) → `prisma-verify-rule`:
 *
 * - Import `PrismaClient` from the generated client at
 *   `../generated/prisma/client` (NOT from `@prisma/client`, which has no
 *   default export in v7).
 * - Use the **`PrismaPg` driver adapter** (mandatory in v7) so the
 *   client connects through `pg` rather than a Rust binary.
 * - Pass explicit pool settings. `pg`'s defaults differ from Prisma 6's,
 *   and `connectionTimeoutMillis: 0` (the `pg` default) causes silent
 *   hangs that look like the API is frozen.
 *
 * `onModuleInit` warms the pool so the first user-facing request doesn't
 * eat the connection latency; `onModuleDestroy` cleanly disconnects on
 * `app.enableShutdownHooks()`-triggered shutdown.
 */
import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
// `PrismaClient` is the runtime class — must come from `client` (not the
// pure-type `models` barrel).
import { PrismaClient } from "../generated/prisma/client";

const POOL_MAX = 10;
const POOL_IDLE_TIMEOUT_MS = 30_000;
const POOL_CONNECTION_TIMEOUT_MS = 5_000;
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const shouldUseDatabaseSsl = (
  databaseUrl: string,
  nodeEnv: Env["NODE_ENV"],
): boolean => {
  if (nodeEnv !== "production") {
    return false;
  }

  const parsedUrl = new URL(databaseUrl);
  if (LOCAL_DATABASE_HOSTS.has(parsedUrl.hostname)) {
    return false;
  }

  // Let an explicit sslmode in the managed URL win. Heroku-managed URLs can be
  // rotated, so production SSL should be enforced in code when sslmode is absent.
  return !parsedUrl.searchParams.has("sslmode");
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(@Inject(ENV) env: Env) {
    const adapter = new PrismaPg({
      connectionString: env.DATABASE_URL,
      ...(shouldUseDatabaseSsl(env.DATABASE_URL, env.NODE_ENV)
        ? { ssl: { rejectUnauthorized: false } }
        : {}),
      max: POOL_MAX,
      idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
    });

    super({
      adapter,
      log: env.NODE_ENV === "production" ? ["warn", "error"] : ["error"],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
