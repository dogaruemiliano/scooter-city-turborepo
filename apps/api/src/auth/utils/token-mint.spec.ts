/**
 * Pure-function tests for the JWT minting helpers. No Nest test module,
 * no DB — fastest tier of test we ship for this subsystem.
 *
 * Each describe block instantiates a `JwtService` with an RS256 keypair
 * directly (matching what `JwtModule.registerAsync` does at boot via the
 * `KeyRing`). The same pattern lets the test verify the token without
 * depending on the production env.
 */
import { JwtService } from "@nestjs/jwt";
import { generateKeyPairSync } from "node:crypto";

import { hashRefreshToken, safeEqualHex } from "./hash";
import {
  mintAccessToken,
  mintRefreshToken,
  ttlStringToSeconds,
} from "./token-mint";

function makeJwt(): { jwt: JwtService; privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const jwt = new JwtService({
    privateKey,
    signOptions: { algorithm: "RS256" },
    verifyOptions: { algorithms: ["RS256"] },
  });
  return { jwt, privateKey, publicKey };
}

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
  it("signs a token whose decoded claims match the input", () => {
    const { jwt, publicKey } = makeJwt();
    const result = mintAccessToken(
      jwt,
      {
        sub: "user-1",
        email: "u@example.com",
        sid: "sess-1",
        roles: ["staff"],
      },
      "15m",
    );
    const decoded = jwt.verify<{
      tokenType: string;
      sub: string;
      email: string;
      sid: string;
      roles: string[];
    }>(result.token, { publicKey });
    expect(decoded.tokenType).toBe("access");
    expect(decoded.sub).toBe("user-1");
    expect(decoded.email).toBe("u@example.com");
    expect(decoded.sid).toBe("sess-1");
    expect(decoded.roles).toEqual(["staff"]);
  });

  it("reports iat/exp consistent with the configured TTL", () => {
    const { jwt } = makeJwt();
    const result = mintAccessToken(
      jwt,
      { sub: "user-1", email: "u@example.com", sid: "sess-1", roles: [] },
      "15m",
    );
    expect(result.expSec - result.iatSec).toBe(900);
  });

  it("verifies with the wrong public key throws", () => {
    const { jwt } = makeJwt();
    const { publicKey: wrongPublicKey } = makeJwt();
    const result = mintAccessToken(
      jwt,
      { sub: "user-1", email: "u@example.com", sid: "sess-1", roles: [] },
      "15m",
    );
    expect(() => {
      jwt.verify(result.token, { publicKey: wrongPublicKey });
    }).toThrow();
  });
});

describe("mintRefreshToken", () => {
  it("embeds a fresh jti distinct from any previous mint", () => {
    const { jwt } = makeJwt();
    const a = mintRefreshToken(jwt, { sub: "user-1", sid: "sess-1" }, "90d");
    const b = mintRefreshToken(jwt, { sub: "user-1", sid: "sess-1" }, "90d");
    expect(a.jti).not.toBe(b.jti);
    expect(a.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("decoded claims include sub, sid and jti", () => {
    const { jwt, publicKey } = makeJwt();
    const result = mintRefreshToken(
      jwt,
      { sub: "user-1", sid: "sess-1" },
      "90d",
    );
    const decoded = jwt.verify<{
      tokenType: string;
      sub: string;
      sid: string;
      jti: string;
    }>(result.token, { publicKey });
    expect(decoded.tokenType).toBe("refresh");
    expect(decoded.sub).toBe("user-1");
    expect(decoded.sid).toBe("sess-1");
    expect(decoded.jti).toBe(result.jti);
  });

  it("reports iat/exp consistent with the 90d TTL", () => {
    const { jwt } = makeJwt();
    const result = mintRefreshToken(
      jwt,
      { sub: "user-1", sid: "sess-1" },
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
