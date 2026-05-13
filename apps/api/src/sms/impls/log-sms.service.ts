/**
 * SMS sender that logs to stdout via pino. Default for `SMS_PROVIDER=log`
 * (dev / test). NEVER reaches a real SMS gateway; safe to enable
 * anywhere.
 *
 * The env validator refuses `SMS_PROVIDER=log` in production when
 * `AUTH_SMS_OTP_ENABLED=true` — see [config/env.ts](../../config/env.ts).
 */
import { Injectable } from "@nestjs/common";
import { Logger } from "nestjs-pino";

import { SmsService, type SmsMessage } from "../sms.service";

@Injectable()
export class LogSmsService extends SmsService {
  constructor(private readonly logger: Logger) {
    super();
  }

  send(message: SmsMessage): Promise<void> {
    this.logger.log(
      { to: message.to, body: message.body },
      "LogSmsService.send",
    );
    return Promise.resolve();
  }
}
