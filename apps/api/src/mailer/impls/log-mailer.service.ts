/**
 * Mailer that logs to stdout via pino. Default for `MAILER_PROVIDER=log`
 * (dev/test). NEVER reaches a real SMTP server; safe to enable anywhere.
 *
 * Used by `pnpm dev` and the API's e2e tests for OTP / verification
 * flows so we can read the code straight out of the test log buffer.
 */
import { Injectable } from "@nestjs/common";
import { Logger } from "nestjs-pino";

import { MailerService, type MailerMessage } from "../mailer.service";

@Injectable()
export class LogMailerService extends MailerService {
  constructor(private readonly logger: Logger) {
    super();
  }

  send(message: MailerMessage): Promise<void> {
    this.logger.log(
      {
        to: message.to,
        subject: message.subject,
        text: message.text,
      },
      "LogMailerService.send",
    );
    return Promise.resolve();
  }
}
