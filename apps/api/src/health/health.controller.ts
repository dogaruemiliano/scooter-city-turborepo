/**
 * Liveness + readiness endpoint.
 *
 * Used by orchestrators (k8s, fly.io, render, …) to decide whether to
 * route traffic to this pod. Returns 200 only when every registered
 * indicator passes:
 *
 * - `memory_heap` — guards against a runaway memory leak.
 * - `db` — Prisma driver-adapter pool answers `SELECT 1` within 2s.
 *
 * Lives outside the versioned `/v1/...` namespace (`VERSION_NEUTRAL`) so
 * orchestrators don't need to be aware of API versions.
 */
import { Controller, Get, VERSION_NEUTRAL } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from "@nestjs/terminus";

import { Public } from "../auth/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("health")
@Public() // orchestrators (k8s, fly.io) probe without an auth context
@Controller({ path: "healthz", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly db: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: "Liveness + readiness probe" })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      // 300 MB heap ceiling — flips the indicator red if the process is leaking.
      () => this.memory.checkHeap("memory_heap", 300 * 1024 * 1024),
      () => this.db.pingCheck("db", this.prisma, { timeout: 2000 }),
    ]);
  }
}
