/**
 * Global SMTP mailer registration.
 *
 * Application code injects `MailerService`; tests can override that token with
 * `SpyMailerService`.
 */
import { Global, Module } from "@nestjs/common";

import { SmtpMailerService } from "./impls/smtp-mailer.service";
import { MailerService } from "./mailer.service";

@Global()
@Module({
  providers: [
    SmtpMailerService,
    { provide: MailerService, useExisting: SmtpMailerService },
  ],
  exports: [MailerService],
})
export class MailerModule {}
