/**
 * In-memory mailer for tests. Captures messages for assertions and is available
 * only through an explicit provider override.
 */
import { Injectable } from "@nestjs/common";

import { MailerService, type MailerMessage } from "../mailer.service";

@Injectable()
export class SpyMailerService extends MailerService {
  private readonly outbox: MailerMessage[] = [];

  send(message: MailerMessage): Promise<void> {
    this.outbox.push({ ...message });
    return Promise.resolve();
  }

  /** All messages "sent" since the last `reset()`, oldest first. */
  getOutbox(): readonly MailerMessage[] {
    return this.outbox;
  }

  /** Most recent message addressed to `to`, or `undefined` if none. */
  findLastTo(to: string): MailerMessage | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i--) {
      const message = this.outbox[i];
      if (message && message.to === to) return message;
    }
    return undefined;
  }

  reset(): void {
    this.outbox.length = 0;
  }
}
