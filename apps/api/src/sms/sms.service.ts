export interface SmsMessage {
  /** E.164 phone number. Validated upstream (see `@repo/api-shared` → phoneSchema). */
  to: string;
  /** SMS body. Keep under 160 GSM-7 chars to avoid multipart billing. */
  body: string;
}

/**
 * SMS delivery contract and dependency-injection token.
 *
 * `SmsModule.forRoot()` binds this token to the configured implementation.
 * Tests can replace the binding with `SpySmsService`.
 */
export abstract class SmsService {
  abstract send(message: SmsMessage): Promise<void>;
}
