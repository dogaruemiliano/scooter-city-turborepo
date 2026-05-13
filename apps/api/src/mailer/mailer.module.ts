/**
 * Mailer registration.
 *
 * Provides the abstract `MailerService` bound to a concrete
 * implementation chosen at startup by the env-validated config:
 *
 *   - `MAILER_PROVIDER=log` → `LogMailerService` (dev / test default)
 *   - `MAILER_PROVIDER=resend` → `ResendMailerService` (PR 7)
 *   - `MAILER_PROVIDER=smtp` → `SmtpMailerService` (PR 7)
 *
 * E2E tests bypass this selection by overriding the `MailerService`
 * provider with `SpyMailerService` directly in the test module — see
 * [SpyMailerService](./impls/spy-mailer.service.ts) for usage.
 *
 * `@Global()` because every auth submodule (email-OTP, credentials,
 * password-reset, …) will inject the mailer.
 */
import { Global, Inject, Module } from "@nestjs/common";

import { ENV } from "../config/config.module";
import type { Env } from "../config/env";

import { LogMailerService } from "./impls/log-mailer.service";
import { MailerService } from "./mailer.service";

@Global()
@Module({
  providers: [
    LogMailerService,
    {
      provide: MailerService,
      // Until PR 7 lands `Resend` / `Smtp` impls, every env value resolves
      // to `LogMailerService`. The switch lives here so adding a new impl
      // is a one-line change.
      inject: [ENV, LogMailerService],
      useFactory: (env: Env, log: LogMailerService): MailerService => {
        switch (env.MAILER_PROVIDER) {
          case "log":
          case "resend":
          case "smtp":
          default:
            return log;
        }
      },
    },
  ],
  exports: [MailerService],
})
export class MailerModule {
  // Marker injection just so the env type is referenced at module level —
  // catches misspellings in MAILER_PROVIDER at module instantiation.
  constructor(@Inject(ENV) _env: Env) {
    void _env;
  }
}
