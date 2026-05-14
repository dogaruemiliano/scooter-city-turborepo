/**
 * Unit tests for `ResendMailerService`.
 *
 * Mocks the `resend` SDK so no HTTP traffic is generated. We only
 * verify that we hand the SDK the shape it expects and surface its
 * errors as thrown `Error`s — the SDK itself is trusted.
 */
import type { Env } from "../../config/env";
import { ResendMailerService } from "./resend-mailer.service";

const sendMock = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

function envWith(overrides: Partial<Env> = {}): Env {
  return {
    MAILER_PROVIDER: "resend",
    MAILER_FROM: "noreply@example.com",
    RESEND_API_KEY: "re_test_key",
    ...overrides,
  } as Env;
}

describe("ResendMailerService", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("throws on construction when RESEND_API_KEY is missing", () => {
    expect(
      () => new ResendMailerService(envWith({ RESEND_API_KEY: undefined })),
    ).toThrow(/RESEND_API_KEY/);
  });

  it("delegates send() to the Resend SDK with the expected fields", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "msg_1" }, error: null });
    const svc = new ResendMailerService(envWith());

    await svc.send({
      to: "u@example.com",
      subject: "hi",
      text: "plaintext",
      html: "<p>html</p>",
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      from: "noreply@example.com",
      to: ["u@example.com"],
      subject: "hi",
      text: "plaintext",
      html: "<p>html</p>",
    });
  });

  it("rethrows the SDK's error envelope as a plain Error", async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "Missing recipient" },
    });
    const svc = new ResendMailerService(envWith());

    await expect(svc.send({ to: "", subject: "x", text: "y" })).rejects.toThrow(
      /validation_error: Missing recipient/,
    );
  });
});
