/**
 * SMS registration. Mirror of `MailerModule`:
 *
 *   - `SMS_PROVIDER=log`  → `LogSmsService` (dev / test default)
 *   - `SMS_PROVIDER=smso` → `SmsoSmsService` (production, SMSO.ro)
 *
 * Both impls are eagerly registered as providers — only the one chosen
 * by `env.SMS_PROVIDER` is bound to the abstract `SmsService` token via
 * the `useFactory` switch. Unselected impls' constructors still run, so
 * each impl validates its own required env in the constructor rather
 * than at the factory level — keeps the factory free of provider-
 * specific knowledge.
 *
 * E2E tests override `SmsService` with `SpySmsService` directly:
 *
 *   ```ts
 *   Test.createTestingModule({ imports: [AppModule] })
 *     .overrideProvider(SmsService).useClass(SpySmsService)
 *     .compile();
 *   ```
 */
import { Global, Inject, Module } from "@nestjs/common";

import { ENV } from "../config/config.module";
import type { Env } from "../config/env";

import { LogSmsService } from "./impls/log-sms.service";
import { SmsoSmsService } from "./impls/smso-sms.service";
import { SmsService } from "./sms.service";

@Global()
@Module({
  providers: [
    LogSmsService,
    {
      provide: SmsService,
      // `SmsoSmsService` is conditionally registered below — keep its
      // injection token in the dependency list only when it's actually
      // selected, otherwise Nest tries to construct it (and trips its
      // env-validation constructor) just to feed it to a switch we
      // never take.
      inject: [ENV, LogSmsService, { token: SmsoSmsService, optional: true }],
      useFactory: (
        env: Env,
        log: LogSmsService,
        smso?: SmsoSmsService,
      ): SmsService => {
        switch (env.SMS_PROVIDER) {
          case "smso":
            if (!smso) {
              throw new Error(
                "SMSO_SMS_SERVICE was not registered. This is a wiring bug.",
              );
            }
            return smso;
          case "log":
          default:
            return log;
        }
      },
    },
    // SmsoSmsService is registered only when selected so its
    // constructor (which validates SMSO_API_KEY + SMSO_SENDER) does
    // not throw on `SMS_PROVIDER=log` runs.
    ...buildConditionalSmsoProvider(),
  ],
  exports: [SmsService],
})
export class SmsModule {
  constructor(@Inject(ENV) _env: Env) {
    void _env;
  }
}

/**
 * Lazily-registered SMSO provider. Returns the provider array entry
 * only when `SMS_PROVIDER=smso` so the impl's env-validating
 * constructor stays dormant on the other code path.
 *
 * Reading `process.env` directly here is acceptable because module-
 * graph construction happens once at boot, well before the env-vs-
 * config-token wiring is in play, and `ENV` itself is not yet
 * injectable inside a static module-definition block.
 */
function buildConditionalSmsoProvider() {
  if (process.env.SMS_PROVIDER === "smso") {
    return [SmsoSmsService];
  }
  return [];
}
