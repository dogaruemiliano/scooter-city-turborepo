/**
 * Unit tests for `SmtpMailerService`.
 *
 * Mocks `nodemailer.createTransport` so no SMTP traffic is generated.
 * Verifies the constructor wires the right transport options and that
 * `send()` forwards a complete `sendMail` payload.
 */
import type { Transporter } from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import type { Env } from "../../config/env";
import { SmtpMailerService } from "./smtp-mailer.service";

const sendMailMock = jest.fn<Promise<unknown>, [Mail.Options]>();
const closeMock = jest.fn<void, []>();
const createTransportMock = jest.fn<Transporter, [SMTPTransport.Options]>();

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: {
    createTransport: (options: SMTPTransport.Options): Transporter =>
      createTransportMock(options),
  },
  createTransport: (options: SMTPTransport.Options): Transporter =>
    createTransportMock(options),
}));

function envWith(overrides: Partial<Env> = {}): Env {
  return {
    MAILER_FROM: "noreply@example.com",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: 587,
    SMTP_USER: "user",
    SMTP_PASSWORD: "pass",
    ...overrides,
  } as Env;
}

describe("SmtpMailerService", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    closeMock.mockReset();
    createTransportMock.mockReset();
    createTransportMock.mockReturnValue({
      sendMail: sendMailMock,
      close: closeMock,
    } as unknown as Transporter);
  });

  it.each<[Partial<Env>, RegExp]>([
    [{ SMTP_HOST: undefined }, /required/i],
    [{ SMTP_PORT: undefined }, /required/i],
    [{ SMTP_USER: undefined }, /required/i],
    [{ SMTP_PASSWORD: undefined }, /required/i],
  ])("throws on construction when %p is missing", (overrides, expected) => {
    expect(() => new SmtpMailerService(envWith(overrides))).toThrow(expected);
  });

  it("creates the transport with auth + STARTTLS-on-587 settings", () => {
    new SmtpMailerService(envWith());
    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(createTransportMock).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: { user: "user", pass: "pass" },
    });
  });

  it("uses implicit-TLS (secure: true) on port 465", () => {
    new SmtpMailerService(envWith({ SMTP_PORT: 465 }));
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it("forwards send() to transporter.sendMail with the expected payload", async () => {
    sendMailMock.mockResolvedValueOnce({ messageId: "<abc@example.com>" });
    const svc = new SmtpMailerService(envWith());

    await svc.send({
      to: "u@example.com",
      subject: "hi",
      text: "plaintext",
      html: "<p>html</p>",
    });

    expect(sendMailMock).toHaveBeenCalledWith({
      from: "noreply@example.com",
      to: "u@example.com",
      subject: "hi",
      text: "plaintext",
      html: "<p>html</p>",
    });
  });

  it("onModuleDestroy closes the transporter", () => {
    const svc = new SmtpMailerService(envWith());
    svc.onModuleDestroy();
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
