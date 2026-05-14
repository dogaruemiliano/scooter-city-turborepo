/**
 * Email-OTP auth method.
 *
 * Two endpoints under `/v1/auth/email-otp/...`:
 *
 *   POST /request   issue a 6-digit code by email
 *   POST /verify    exchange a valid code for a fresh session
 *
 * Conditionally wired into `AuthModule.forRoot()` based on
 * `env.AUTH_EMAIL_OTP_ENABLED`. When disabled, the routes don't exist
 * (404) and the providers aren't registered.
 *
 * `CoreAuthModule` and `UsersModule` are re-imported locally because
 * `EmailOtpService` injects `CoreAuthService` + `UsersService`. Nest
 * deduplicates the registration against the parent `AuthModule` import,
 * so there's still one instance of each — but the local import is
 * required for the sibling module to see the providers (the
 * `@Global()` shortcut is intentionally avoided per project memory).
 *
 * `MailerModule`, `AuditModule`, and `PrismaModule` are `@Global()`, so
 * we inject `MailerService` / `AuditService` / `PrismaService` without
 * declaring the import.
 */
import { Module } from "@nestjs/common";

import { UsersModule } from "../../../users/users.module";
import { CoreAuthModule } from "../core-auth/core-auth.module";

import { EmailOtpController } from "./email-otp.controller";
import { EmailOtpService } from "./email-otp.service";

@Module({
  imports: [UsersModule, CoreAuthModule],
  controllers: [EmailOtpController],
  providers: [EmailOtpService],
})
export class EmailOtpModule {}
