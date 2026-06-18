import { Injectable } from "@nestjs/common";
import { Logger } from "nestjs-pino";

import { SmsService, type SmsMessage } from "../sms.service";

/** Development SMS implementation that logs without contacting a provider. */
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
