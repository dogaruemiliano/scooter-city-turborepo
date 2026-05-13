/**
 * Pure-function tests for the JWT minting helpers. No Nest test module,
 * no DB — fastest tier of test we ship for this subsystem.
 */
import { JwtService } from "@nestjs/jwt";

import { hashRefreshToken, safeEqualHex } from "./hash";
import {
  mintAccessToken,
  mintRefreshToken,
  ttlStringToSeconds,
} from "./token-mint";

const ACCESS_SECRET = "x".repeat(32);
const REFRESH_SECRET = "y".repeat(32);

describe("ttlStringToSeconds", () => {
  it.each([
    ["15m", 900],
    ["1h", 3600],
    ["90d", 90 * 24 * 60 * 60],
    ["30s", 30],
  ])("converts %s to %d seconds", (input, expected) => {
    expect(ttlStringToSeconds(input)).toBe(expected);
  });

  it.each(["not-a-duration", "", "1xyz"])(
    "throws on invalid input %s",
    (input) => {
      expect(() => ttlStringToSeconds(input)).toThrow(/Invalid JWT TTL/);
    },
  );
});

describe("mintAccessToken", () => {
  const jwt = new JwtService({});

  it("signs a token whose decoded claims match the input", () => {
    const result = mintAccessToken(
      jwt,
      { sub: "user-1", email: "u@example.com", sid: "sess-1" },
      ACCESS_SECRET,
      "15m",
    );
    const decoded = jwt.verify<{ sub: string; email: string; sid: string }>(
      result.token,
      { secret: ACCESS_SECRET },
    );
    expect(decoded.sub).toBe("user-1");
    expect(decoded.email).toBe("u@example.com");
    expect(decoded.sid).toBe("sess-1");
  });

  it("reports iat/exp consistent with the configured TTL", () => {
    const result = mintAccessToken(
      jwt,
      { sub: "user-1", email: "u@example.com", sid: "sess-1" },
      ACCESS_SECRET,
      "15m",
    );
    expect(result.expSec - result.iatSec).toBe(900);
  });

  it("verifies with the wrong secret throws", () => {
    const result = mintAccessToken(
      jwt,
      { sub: "user-1", email: "u@example.com", sid: "sess-1" },
      ACCESS_SECRET,
      "15m",
    );
    expect(() =>
      jwt.verify(result.token, { secret: "wrong".repeat(8) }),
    ).toThrow();
  });
});

describe("mintRefreshToken", () => {
  const jwt = new JwtService({});

  it("embeds a fresh jti distinct from any previous mint", () => {
    const a = mintRefreshToken(
      jwt,
      { sub: "user-1", sid: "sess-1" },
      REFRESH_SECRET,
      "90d",
    );
    const b = mintRefreshToken(
      jwt,
      { sub: "user-1", sid: "sess-1" },
      REFRESH_SECRET,
      "90d",
    );
    expect(a.jti).not.toBe(b.jti);
    expect(a.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("decoded claims include sub, sid and jti", () => {
    const result = mintRefreshToken(
      jwt,
      { sub: "user-1", sid: "sess-1" },
      REFRESH_SECRET,
      "90d",
    );
    const decoded = jwt.verify<{ sub: string; sid: string; jti: string }>(
      result.token,
      { secret: REFRESH_SECRET },
    );
    expect(decoded.sub).toBe("user-1");
    expect(decoded.sid).toBe("sess-1");
    expect(decoded.jti).toBe(result.jti);
  });

  it("reports iat/exp consistent with the 90d TTL", () => {
    const result = mintRefreshToken(
      jwt,
      { sub: "user-1", sid: "sess-1" },
      REFRESH_SECRET,
      "90d",
    );
    expect(result.expSec - result.iatSec).toBe(90 * 24 * 60 * 60);
  });
});

describe("hash util", () => {
  it("safeEqualHex matches identical hex digests", () => {
    const a = hashRefreshToken("token-1", "secret-1");
    const b = hashRefreshToken("token-1", "secret-1");
    expect(safeEqualHex(a, b)).toBe(true);
  });

  it("safeEqualHex rejects when one byte differs", () => {
    const a = hashRefreshToken("token-1", "secret-1");
    const b = hashRefreshToken("token-2", "secret-1");
    expect(safeEqualHex(a, b)).toBe(false);
  });
});
