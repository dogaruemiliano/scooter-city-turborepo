/**
 * SMS registration. Mirror of `MailerModule`:
 *
 *   - `SMS_PROVIDER=log` → `LogSmsService` (dev / test default)
 *   - `SMS_PROVIDER=smso` → `SmsoSmsService` (PR 13, SMSO.ro adapter)
 *
 * E2E tests override `SmsService` with `SpySmsService` directly.
 */
import { Global, Inject, Module } from "@nestjs/common";

import { ENV } from "../config/config.module";
import type { Env } from "../config/env";

import { LogSmsService } from "./impls/log-sms.service";
import { SmsService } from "./sms.service";

@Global()
@Module({
  providers: [
    LogSmsService,
    {
      provide: SmsService,
      // Until PR 13 lands the SMSO adapter, every env value resolves to
      // `LogSmsService`. Adding the SMSO branch is a one-line change.
      inject: [ENV, LogSmsService],
      useFactory: (env: Env, log: LogSmsService): SmsService => {
        switch (env.SMS_PROVIDER) {
          case "log":
          case "smso":
          default:
            return log;
        }
      },
    },
  ],
  exports: [SmsService],
})
export class SmsModule {
  constructor(@Inject(ENV) _env: Env) {
    void _env;
  }
}
