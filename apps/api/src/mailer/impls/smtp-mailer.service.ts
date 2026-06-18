/**
 * Mailer that ships messages via SMTP using `nodemailer`.
 *
 * `MailerModule` always binds `MailerService` to this implementation.
 * SMTP authentication credentials are required in every environment.
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
      // Defensive — the env schema already requires both values.
      throw new Error(
        "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD are required.",
      );
    }

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // Port 465 uses implicit TLS. Other ports can upgrade via STARTTLS.
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
