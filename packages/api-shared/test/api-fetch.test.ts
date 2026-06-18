import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { z } from "zod";

import {
  apiFetch,
  configureAuthAdapter,
  createApiClient,
  type AuthAdapter,
} from "../src/api-fetch";

const originalFetch = globalThis.fetch;

afterEach(() => {
  configureAuthAdapter(null);
  globalThis.fetch = originalFetch;
});

test("normalizes a root API URL and removes its trailing slash", () => {
  const api = createApiClient("https://API.Example.com:443/");

  assert.equal(api.baseUrl, "https://api.example.com");
  assert.equal(api.url("/v1/auth/me"), "https://api.example.com/v1/auth/me");
});

test("rejects missing and invalid API base URLs", () => {
  assert.throws(() => createApiClient(undefined), /API base URL is required/);
  assert.throws(
    () => createApiClient("api.example.com"),
    /absolute HTTP\(S\) URL/,
  );
  assert.throws(
    () => createApiClient("ftp://api.example.com"),
    /http: or https:/,
  );
  assert.throws(
    () => createApiClient("https://user:pass@api.example.com"),
    /must not contain credentials/,
  );
  assert.throws(
    () => createApiClient("https://api.example.com/v1"),
    /must not contain a path/,
  );
  assert.throws(
    () => createApiClient("https://api.example.com?region=eu"),
    /must not contain a query or fragment/,
  );
  assert.throws(
    () => createApiClient("https://api.example.com#auth"),
    /must not contain a query or fragment/,
  );
});

test("resolves relative paths and preserves absolute HTTP URLs", () => {
  const api = createApiClient("http://localhost:3000/");

  assert.equal(
    api.url("/v1/auth/enabled-methods?fresh=1"),
    "http://localhost:3000/v1/auth/enabled-methods?fresh=1",
  );
  assert.equal(
    api.url("https://other.example.com/healthz"),
    "https://other.example.com/healthz",
  );
  assert.throws(
    () => api.url("//other.example.com/healthz"),
    /must stay on the API origin/,
  );
});

test("bound fetch passes the normalized base URL to refresh adapters", async () => {
  const refreshBases: string[] = [];
  const adapter: AuthAdapter = {
    async refresh(baseUrl) {
      refreshBases.push(baseUrl);
      return false;
    },
  };
  configureAuthAdapter(adapter);
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: { message: "Authentication required" } }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    );

  const api = createApiClient("https://api.example.com/");
  await assert.rejects(
    api.fetch("/v1/auth/me", z.object({ id: z.string() })),
    /Authentication required/,
  );

  assert.deepEqual(refreshBases, ["https://api.example.com"]);
});

test("raw apiFetch accepts absolute URLs without a base URL", async () => {
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return Response.json({ status: "ok" });
  };

  const result = await apiFetch(
    "https://status.example.com/healthz",
    z.object({ status: z.literal("ok") }),
  );

  assert.deepEqual(result, { status: "ok" });
  assert.equal(requestedUrl, "https://status.example.com/healthz");
});

test("raw apiFetch rejects relative paths without an explicit base URL", async () => {
  await assert.rejects(
    apiFetch("/v1/auth/me", z.unknown()),
    /requires options\.baseUrl or createApiClient/,
  );
});
