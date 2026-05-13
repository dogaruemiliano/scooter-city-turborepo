/**
 * Global module exposing `PrismaService`. Every feature module that needs
 * DB access just injects the service — no need to re-import this module.
 *
 * `@Global()` is justified here because Prisma is genuinely cross-cutting;
 * exporting from a single module without `@Global` would force every
 * downstream module to re-declare it in its own `imports`, which is
 * boilerplate without value.
 */
import { Global, Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
