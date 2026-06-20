import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { proxy } from "./proxy";

const mocks = vi.hoisted(() => ({
  handleI18nRouting: vi.fn(),
  webApiUrl: vi.fn((path: string) => `https://api.test${path}`),
}));

vi.mock("next-intl/middleware", () => ({
  default: () => mocks.handleI18nRouting,
}));

vi.mock("./lib/api", () => ({
  webApi: {
    url: mocks.webApiUrl,
  },
}));

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://web.test${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("proxy auth refresh handling", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    mocks.webApiUrl.mockClear();
    mocks.handleI18nRouting.mockReset();
    mocks.handleI18nRouting.mockImplementation(
      () => new Response(null, { status: 200 }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not redirect to sign-in when the refresh request cannot reach the API", async () => {
    fetchMock.mockRejectedValue(new TypeError("API unavailable"));

    const res = await proxy(
      request("/en/account/settings", "refresh_token=refresh"),
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.text()).resolves.toContain(
      "browser session was not cleared",
    );
  });

  it("does not redirect to sign-in when the refresh endpoint has a server failure", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    const res = await proxy(
      request("/en/account/settings", "refresh_token=refresh"),
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects to sign-in when the refresh token is rejected", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    const res = await proxy(
      request("/en/account/settings", "refresh_token=refresh"),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://web.test/en/sign-in?next=%2Fen%2Faccount%2Fsettings",
    );
  });

  it("attempts refresh on the public sign-in page when a refresh cookie exists", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: [
          ["set-cookie", "access_token=access; Path=/"],
          ["set-cookie", "refresh_token=rotated; Path=/"],
        ],
      }),
    );

    const res = await proxy(request("/en/sign-in", "refresh_token=refresh"));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.test/v1/auth/refresh",
    );
    expect(mocks.handleI18nRouting).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual([
      "access_token=access; Path=/",
      "refresh_token=rotated; Path=/",
    ]);
  });
});
