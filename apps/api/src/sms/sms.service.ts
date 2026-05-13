/**
 * Abstract SMS-delivery contract.
 *
 * Used as the DI token: feature modules inject `SmsService`, the
 * concrete implementation (`Log`, `Spy`, later `Smso`) is chosen at
 * module-registration time by `SmsModule.forRoot`.
 *
 * Tests override the binding by `Test.createTestingModule().overrideProvider(SmsService).useClass(SpySmsService)`.
 */
export interface SmsMessage {
  /** E.164 phone number. Validated upstream (see `@repo/api-shared` → phoneSchema). */
  to: string;
  /** SMS body. Keep under 160 GSM-7 chars to avoid multipart billing. */
  body: string;
}

export abstract class SmsService {
  abstract send(message: SmsMessage): Promise<void>;
}
