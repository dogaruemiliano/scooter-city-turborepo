/**
 * Exposes `GET /healthz` (version-neutral). DB-ping indicator is added in
 * PR 3 once Prisma is wired in.
 */
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
