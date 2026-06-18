/**
 * Daily background sweep that hard-deletes auth rows the application will
 * never touch again. Runs at 03:00 server-local time via `@nestjs/schedule`.
 *
 * Four auth record types plus expired OTP quota windows:
 *
 * - `RefreshToken WHERE expiresAt < now` — once a refresh JWT can no longer
 *   verify (signature TTL hit), its DB row only exists to be skipped by
 *   the rotation lookup. The rotation code already rejects expired tokens,
 *   so deletion is purely an index-bloat measure.
 *
 * - `OtpChallenge WHERE expiresAt < now - INTERVAL '7 days'` — OTPs become
 *   useless minutes after issue (`OTP_TTL`, default 10m). We keep an
 *   extra 7-day window for incident correlation.
 *
 * - `OtpDeliveryQuota WHERE windowEnd < now` — fixed-window delivery
 *   counters have no value after their window closes.
 *
 * - `Session WHERE revokedAt < now - INTERVAL '30 days'` — revoked
 *   sessions stay long enough for "log out other devices" UX and incident
 *   forensics (a stolen-laptop investigation a couple of weeks later).
 *   After 30 days the row is dead weight.
 *
 * `AuditEvent` is **never** touched here — audit history is append-only
 * and outlives users (FK `SetNull` on user delete). GDPR-driven purging
 * of audit data is a separate, opt-in job not in v1 scope.
 *
 * The service is registered conditionally by `AuthModule.forRoot()` based
 * on `env.AUTH_CLEANUP_ENABLED` so tests can leave it off when the cron
 * would interfere.
 *
 * # Manual invocation
 *
 * The cron decorator only runs on the schedule. The public
 * [`runOnce()`](#runonce) method is intentional — it lets the e2e test
 * exercise the exact same code path the scheduler does without faking
 * `Date.now()` or waiting until 03:00.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { PrismaService } from "../../prisma/prisma.service";

/** Result shape returned by `runOnce()` so tests can assert counts. */
export interface AuthCleanupResult {
  refreshTokensDeleted: number;
  otpChallengesDeleted: number;
  otpDeliveryQuotasDeleted: number;
  sessionsDeleted: number;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cron entry point. The `@Cron` decorator only fires on the schedule;
   * the body delegates to `runOnce` so both paths share one
   * implementation.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: "auth-cleanup" })
  async handleCron(): Promise<void> {
    const result = await this.runOnce();
    this.logger.log(
      `auth-cleanup: deleted refreshTokens=${result.refreshTokensDeleted} otpChallenges=${result.otpChallengesDeleted} otpDeliveryQuotas=${result.otpDeliveryQuotasDeleted} sessions=${result.sessionsDeleted}`,
    );
  }

  /**
   * Run a single cleanup pass and return per-table delete counts.
   * Idempotent: running twice in a row leaves nothing to delete the
   * second time.
   */
  async runOnce(): Promise<AuthCleanupResult> {
    const now = new Date();
    const otpCutoff = new Date(now.getTime() - SEVEN_DAYS_MS);
    const sessionCutoff = new Date(now.getTime() - THIRTY_DAYS_MS);

    const [refresh, otpChallenge, otpDeliveryQuota, session] =
      await this.prisma.$transaction([
        this.prisma.refreshToken.deleteMany({
          where: { expiresAt: { lt: now } },
        }),
        this.prisma.otpChallenge.deleteMany({
          where: { expiresAt: { lt: otpCutoff } },
        }),
        this.prisma.otpDeliveryQuota.deleteMany({
          where: { windowEnd: { lt: now } },
        }),
        this.prisma.session.deleteMany({
          where: { revokedAt: { lt: sessionCutoff } },
        }),
      ]);

    return {
      refreshTokensDeleted: refresh.count,
      otpChallengesDeleted: otpChallenge.count,
      otpDeliveryQuotasDeleted: otpDeliveryQuota.count,
      sessionsDeleted: session.count,
    };
  }
}
