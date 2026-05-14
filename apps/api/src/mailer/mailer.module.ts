/**
 * Mailer registration.
 *
 * `forRoot(env)` is a `DynamicModule` factory that binds the abstract
 * `MailerService` to a single concrete implementation selected at
 * module-graph build time:
 *
 *   - `MAILER_PROVIDER=log`    → [`LogMailerService`](./impls/log-mailer.service.ts)
 *                                (dev / test default, prints to stdout)
 *   - `MAILER_PROVIDER=resend` → [`ResendMailerService`](./impls/resend-mailer.service.ts)
 *                                (Resend HTTP API)
 *   - `MAILER_PROVIDER=smtp`   → [`SmtpMailerService`](./impls/smtp-mailer.service.ts)
 *                                (nodemailer)
 *
 * Only the selected impl is registered as a provider — the others
 * aren't constructed and never validate their (potentially missing)
 * env. This avoids the foot-gun of an unselected impl throwing on
 * startup because its credentials env isn't set.
 *
 * E2E tests bypass the env selection by overriding the `MailerService`
 * provider directly:
 *
 *   ```ts
 *   Test.createTestingModule({ imports: [AppModule] })
 *     .overrideProvider(MailerService).useClass(SpyMailerService)
 *     .compile();
 *   ```
 *
 * `@Global()` because every auth submodule (email-OTP, future password
 * reset, new-device email) injects the mailer.
 *
 * Design rationale in [`docs/adr/0005-pluggable-mailer-sms.md`](../../../../docs/adr/0005-pluggable-mailer-sms.md).
 */
import {
  DynamicModule,
  Global,
  Module,
  type Provider,
  type Type,
} from "@nestjs/common";

import type { Env } from "../config/env";

import { LogMailerService } from "./impls/log-mailer.service";
import { ResendMailerService } from "./impls/resend-mailer.service";
import { SmtpMailerService } from "./impls/smtp-mailer.service";
import { MailerService } from "./mailer.service";

@Global()
@Module({})
export class MailerModule {
  /**
   * Build the mailer-module graph with the impl selected by
   * `env.MAILER_PROVIDER`. The selected class is registered as a
   * regular Nest provider so its dependencies (`ENV`, `Logger`) resolve
   * through DI and its lifecycle hooks (`onModuleDestroy`) fire.
   */
  static forRoot(env: Env): DynamicModule {
    const impl = pickMailerImpl(env);
    const providers: Provider[] = [
      impl,
      { provide: MailerService, useExisting: impl },
    ];

    return {
      module: MailerModule,
      providers,
      exports: [MailerService],
    };
  }
}

function pickMailerImpl(env: Env): Type<MailerService> {
  switch (env.MAILER_PROVIDER) {
    case "resend":
      return ResendMailerService;
    case "smtp":
      return SmtpMailerService;
    case "log":
      return LogMailerService;
  }
}
