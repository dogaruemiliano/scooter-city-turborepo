/**
 * Production mailer that ships messages via SMTP using `nodemailer`.
 *
 * Wired in by `MailerModule` when `env.MAILER_PROVIDER=smtp`. The env
 * schema's cross-field rule already guarantees `SMTP_HOST`, `SMTP_PORT`,
 * `SMTP_USER`, `SMTP_PASSWORD` are present in that case (see
 * [config/env.ts](../../config/env.ts)).
 *
 * The transporter is constructed once at module init and reused for
 * every send. `nodemailer`'s default `pool: false` is left on — the
 * volume of auth-related mail in v1 (OTPs, new-device notifications) is
 * far below what would benefit from pooling, and pooling complicates
 * graceful shutdown.
 */
import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";

import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";
import { MailerService, type MailerMessage } from "../mailer.service";

@Injectable()
export class SmtpMailerService
  extends MailerService
  implements OnModuleDestroy
{
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(@Inject(ENV) env: Env) {
    super();
    if (
      !env.SMTP_HOST ||
      !env.SMTP_PORT ||
      !env.SMTP_USER ||
      !env.SMTP_PASSWORD
    ) {
      // Defensive — the env schema's superRefine already catches this.
      throw new Error(
        "SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASSWORD are all required when MAILER_PROVIDER=smtp.",
      );
    }
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // STARTTLS on 587, implicit TLS on 465. nodemailer auto-detects
      // from the port, but explicitly setting `secure` removes ambiguity.
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });
    this.from = env.MAILER_FROM;
  }

  async send(message: MailerMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }
}
