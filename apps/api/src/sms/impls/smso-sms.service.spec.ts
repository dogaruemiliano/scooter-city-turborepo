/**
 * Unit tests for `SmsoSmsService`. `globalThis.fetch` is stubbed; no
 * real network calls. Asserts the request shape the SMSO.ro API expects
 * (URL, headers, JSON body) and that the adapter throws on non-2xx and
 * on the in-band `status` field returned in a 200 envelope.
 */
import { SmsoSmsService } from "./smso-sms.service";

import type { Env } from "../../config/env";

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

  it("POSTs to the SMSO endpoint with the X-Authorization header and a JSON body of { sender, to, body, type: 'otp' }", async () => {
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

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://app.smso.ro/api/v1/send");
    expect(init?.method).toBe("POST");

    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Authorization"]).toBe(FAKE_ENV.SMSO_API_KEY);
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      sender: FAKE_ENV.SMSO_SENDER,
      to: "+40712345678",
      body: "Your code is 000000",
      type: "otp",
    });
  });

  it("throws when SMSO returns a non-2xx HTTP status, including the body in the error", async () => {
    // Each call needs a fresh Response — `Response.body` is consumed
    // after the first `.text()` read, and we assert against two
    // independent send() invocations to keep the patterns separate.
    globalThis.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve(
        new Response("invalid api key", {
          status: 401,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    ) as unknown as typeof globalThis.fetch;

    const service = buildService();
    await expect(
      service.send({ to: "+40712345678", body: "hi" }),
    ).rejects.toThrow(/HTTP 401/);
    await expect(
      service.send({ to: "+40712345678", body: "hi" }),
    ).rejects.toThrow(/invalid api key/);
  });

  it("throws when SMSO returns a 200 HTTP with a non-200 status in the JSON envelope (e.g. blacklisted content)", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 403, message: "blacklisted" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof globalThis.fetch;

    const service = buildService();
    await expect(
      service.send({ to: "+40712345678", body: "hi" }),
    ).rejects.toThrow(/non-200 envelope status: 403/);
  });

  it("does not throw when the success envelope omits the status field", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ responseToken: "tok-2" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof globalThis.fetch;

    const service = buildService();
    await expect(
      service.send({ to: "+40712345678", body: "hi" }),
    ).resolves.toBeUndefined();
  });

  it("does not throw when the response body is not JSON but the HTTP status is 2xx", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response("OK", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    ) as unknown as typeof globalThis.fetch;

    const service = buildService();
    await expect(
      service.send({ to: "+40712345678", body: "hi" }),
    ).resolves.toBeUndefined();
  });

  it("constructor throws when SMSO_API_KEY is missing", () => {
    expect(
      () => new SmsoSmsService({ SMSO_SENDER: "X" } as unknown as Env),
    ).toThrow(/SMSO_API_KEY is required/);
  });

  it("constructor throws when SMSO_SENDER is missing", () => {
    expect(
      () => new SmsoSmsService({ SMSO_API_KEY: "k" } as unknown as Env),
    ).toThrow(/SMSO_SENDER is required/);
  });
});
