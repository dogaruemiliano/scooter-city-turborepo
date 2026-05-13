/**
 * In-memory SMS sender for E2E tests. Mirror of `SpyMailerService`.
 *
 * Wired via `Test.createTestingModule(...).overrideProvider(SmsService).useClass(SpySmsService)`.
 * Tests grab the most recent OTP-bearing SMS via `findLastTo(phone)`.
 */
import { Injectable } from "@nestjs/common";

import { SmsService, type SmsMessage } from "../sms.service";

@Injectable()
export class SpySmsService extends SmsService {
  private readonly outbox: SmsMessage[] = [];

  send(message: SmsMessage): Promise<void> {
    this.outbox.push({ ...message });
    return Promise.resolve();
  }

  getOutbox(): readonly SmsMessage[] {
    return this.outbox;
  }

  findLastTo(to: string): SmsMessage | undefined {
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
