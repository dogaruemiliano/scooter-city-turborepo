/**
 * Abstract mail-delivery contract.
 *
 * Used as the DI token: feature modules inject `MailerService`, and
 * `MailerModule` binds it to SMTP. Tests can override it with
 * `SpyMailerService`.
 *
 * Tests override the binding by `Test.createTestingModule().overrideProvider(MailerService).useClass(SpyMailerService)`.
 */
export interface MailerMessage {
  /** Recipient address. Validated upstream (see `@repo/api-shared` → emailSchema). */
  to: string;
  subject: string;
  /** Plain-text body. Always sent. */
  text: string;
  /** HTML body. Optional; clients without HTML support fall back to `text`. */
  html?: string;
}

export abstract class MailerService {
  abstract send(message: MailerMessage): Promise<void>;
}
