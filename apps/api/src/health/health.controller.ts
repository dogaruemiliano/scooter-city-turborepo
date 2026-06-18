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
import { Controller, Get, Inject, VERSION_NEUTRAL } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from "@nestjs/terminus";
import { SkipThrottle } from "@nestjs/throttler";

import { Public } from "../auth/decorators/public.decorator";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

const BYTES_PER_MIB = 1024 * 1024;

@ApiTags("health")
@Public() // orchestrators (k8s, fly.io) probe without an auth context
@SkipThrottle()
@Controller({ path: "healthz", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly db: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: "Liveness + readiness probe" })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () =>
        this.memory.checkHeap(
          "memory_heap",
          this.env.HEALTH_MAX_HEAP_MB * BYTES_PER_MIB,
        ),
      () => this.db.pingCheck("db", this.prisma, { timeout: 2000 }),
    ]);
  }
}
