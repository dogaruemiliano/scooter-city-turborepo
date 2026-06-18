import type { Env } from "../../config/env";

import { SmsoSmsService } from "./smso-sms.service";

const FAKE_ENV: Pick<Env, "SMSO_API_KEY" | "SMSO_SENDER"> = {
  SMSO_API_KEY: "smso-test-key",
  SMSO_SENDER: "TestSender",
};

function buildService(): SmsoSmsService {
  return new SmsoSmsService(FAKE_ENV as Env);
}

describe("SmsoSmsService", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("POSTs messages with the SMSO headers and body", async () => {
    const fetchSpy = jest
      .fn<
        Promise<Response>,
        [input: string | URL | Request, init?: RequestInit]
      >()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 200, responseToken: "tok-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const service = buildService();
    await service.send({ to: "+40712345678", body: "Your code is 000000" });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://app.smso.ro/api/v1/send");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "Content-Type": "application/json",
      "X-Authorization": FAKE_ENV.SMSO_API_KEY,
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      sender: FAKE_ENV.SMSO_SENDER,
      to: "+40712345678",
      body: "Your code is 000000",
      type: "otp",
    });
  });

  it("throws on non-2xx responses and includes the response body", async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response("invalid api key", { status: 401 }),
      ) as unknown as typeof globalThis.fetch;

    await expect(
      buildService().send({ to: "+40712345678", body: "hi" }),
    ).rejects.toThrow(/HTTP 401.*invalid api key/);
  });

  it("throws on non-200 SMSO envelope statuses", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 403, message: "blacklisted" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof globalThis.fetch;

    await expect(
      buildService().send({ to: "+40712345678", body: "hi" }),
    ).rejects.toThrow(/non-200 envelope status: 403/);
  });

  it("accepts successful responses without a JSON status field", async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response("OK", { status: 200 }),
      ) as unknown as typeof globalThis.fetch;

    await expect(
      buildService().send({ to: "+40712345678", body: "hi" }),
    ).resolves.toBeUndefined();
  });

  it("requires SMSO_API_KEY", () => {
    expect(
      () => new SmsoSmsService({ SMSO_SENDER: "X" } as unknown as Env),
    ).toThrow(/SMSO_API_KEY is required/);
  });

  it("requires SMSO_SENDER", () => {
    expect(
      () => new SmsoSmsService({ SMSO_API_KEY: "k" } as unknown as Env),
    ).toThrow(/SMSO_SENDER is required/);
  });
});
