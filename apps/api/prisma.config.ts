/**
 * Prisma 7 config. Single source of truth for:
 *   - schema location
 *   - datasource URL (was in `schema.prisma` on 6.x; moved here in 7.x)
 *   - migration directory and seed command
 *
 * The schema file no longer carries the `url` property — `prisma migrate`
 * reads it from here. `PrismaClient` runtime construction (in PrismaModule,
 * later PR) will likewise be passed the URL or an adapter.
 *
 * @see https://www.prisma.io/docs/orm/reference/prisma-config-reference
 */
import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
