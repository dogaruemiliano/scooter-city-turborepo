import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

afterEach(() => vi.unstubAllGlobals());
const context = (path: string) => ({
  params: Promise.resolve({ path: path.split("/") }),
});
const request = (
  path: string,
  options: NonNullable<ConstructorParameters<typeof NextRequest>[1]> = {},
) => new NextRequest(`https://web.test/api/signing/${path}`, options);

it("rejects cookie-bearing mutations without a matching origin and CSRF header", async () => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  const response = await POST(
    request("session", {
      method: "POST",
      body: "{}",
      headers: { origin: "https://attacker.test", "x-requested-with": "fetch" },
    }),
    context("session"),
  );
  expect(response.status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});

it("forwards only the restricted signing cookie and safe response cookies", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://api.test";
  const upstream = vi.fn().mockResolvedValue(
    new Response("{}", {
      headers: {
        "content-type": "application/json",
        "set-cookie":
          "scooter_signing=rotated; Path=/; HttpOnly; SameSite=Strict",
      },
    }),
  );
  vi.stubGlobal("fetch", upstream);
  const response = await GET(
    request("state", {
      headers: {
        cookie:
          "access_token=admin; refresh_token=secret; scooter_signing=guest",
      },
    }),
    context("state"),
  );
  const forwarded = upstream.mock.calls[0]![1] as RequestInit;
  expect(new Headers(forwarded.headers).get("cookie")).toBe(
    "scooter_signing=guest",
  );
  expect(new Headers(forwarded.headers).get("authorization")).toBeNull();
  expect(response.headers.get("set-cookie")).toContain(
    "scooter_signing=rotated",
  );
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});

it("does not proxy arbitrary paths or unapproved file query parameters", async () => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  expect(
    (
      await GET(
        request("../contracts/templates"),
        context("../contracts/templates"),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await GET(
        request("documents/doc/file?url=https://attacker.test"),
        context("documents/doc/file"),
      )
    ).status,
  ).toBe(404);
  expect(upstream).not.toHaveBeenCalled();
});

it("rejects declared oversized uploads before reading the body", async () => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  const response = await POST(
    request("selfie", {
      method: "POST",
      body: "x",
      headers: {
        origin: "https://web.test",
        "x-requested-with": "fetch",
        "content-length": String(11 * 1024 * 1024),
      },
    }),
    context("selfie"),
  );
  expect(response.status).toBe(413);
  expect(upstream).not.toHaveBeenCalled();
});

it("bounds streamed uploads even when Content-Length is absent", async () => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  const response = await POST(
    request("selfie", {
      method: "POST",
      body: "x".repeat(10 * 1024 * 1024 + 1),
      headers: { origin: "https://web.test", "x-requested-with": "fetch" },
    }),
    context("selfie"),
  );
  expect(response.status).toBe(413);
  expect(upstream).not.toHaveBeenCalled();
});
