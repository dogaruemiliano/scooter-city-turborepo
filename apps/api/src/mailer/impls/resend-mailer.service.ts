/**
 * Production mailer that ships messages via Resend (https://resend.com).
 *
 * Wired in by `MailerModule` when `env.MAILER_PROVIDER=resend`. The env
 * schema's cross-field rule already guarantees `RESEND_API_KEY` is
 * present in that case (see [config/env.ts](../../config/env.ts)).
 *
 * Failures surface as thrown errors so the caller can decide whether to
 * audit and propagate, or audit and swallow. We deliberately do NOT
 * retry here — Resend has its own queuing and rate-limit handling, and
 * a per-call retry loop would only mask a deeper problem.
 */
import { Inject, Injectable } from "@nestjs/common";
import { Resend } from "resend";

import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";
import { MailerService, type MailerMessage } from "../mailer.service";

@Injectable()
export class ResendMailerService extends MailerService {
  private readonly client: Resend;
  private readonly from: string;

  constructor(@Inject(ENV) env: Env) {
    super();
    if (!env.RESEND_API_KEY) {
      // Defensive: the env schema's superRefine already catches this.
      // Throwing here makes the misconfiguration loud at construction
      // time rather than silently on the first send.
      throw new Error(
        "RESEND_API_KEY is required when MAILER_PROVIDER=resend.",
      );
    }
    this.client = new Resend(env.RESEND_API_KEY);
    this.from = env.MAILER_FROM;
  }

  async send(message: MailerMessage): Promise<void> {
    const result = await this.client.emails.send({
      from: this.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (result.error) {
      // Resend wraps transport errors in `{ error: { name, message } }`.
      // Re-throw so the caller / audit layer sees a real `Error`.
      throw new Error(
        `Resend send failed: ${result.error.name}: ${result.error.message}`,
      );
    }
  }
}
