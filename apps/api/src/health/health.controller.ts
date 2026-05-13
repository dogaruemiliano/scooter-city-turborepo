/**
 * Liveness + readiness endpoint.
 *
 * Used by orchestrators (k8s, fly.io, render, …) to decide whether to route
 * traffic to this pod. Returns 200 only when every registered indicator
 * passes. The DB indicator is not wired here yet — that lands in PR 3 (Prisma).
 *
 * Lives outside the versioned `/v1/...` namespace (VERSION_NEUTRAL) so
 * orchestrators don't need to be aware of API versions.
 */
import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

@ApiTags('health')
@Controller({ path: 'healthz', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness + readiness probe' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      // 300 MB heap ceiling — flips the indicator red if the process is leaking.
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
    ]);
  }
}
