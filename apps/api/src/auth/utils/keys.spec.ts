import { generateKeyPairSync } from "node:crypto";

import type { Env } from "../../config/env";
import { buildKeyRing, encodePem } from "./keys";

function generatePair(): { privateKey: string; publicKey: string } {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function keyEnv(privateKey: string, publicKey: string): Env {
  return {
    JWT_PRIVATE_KEY: encodePem(privateKey),
    JWT_PUBLIC_KEY: encodePem(publicKey),
  } as Env;
}

describe("buildKeyRing", () => {
  it("accepts a matching signing keypair", () => {
    const pair = generatePair();
    const ring = buildKeyRing(keyEnv(pair.privateKey, pair.publicKey));

    expect(ring.currentKid).toBe(ring.jwks.keys[0]?.kid);
    expect(ring.byKid.get(ring.currentKid)).toBe(pair.publicKey);
  });

  it("rejects a mismatched private and public key", () => {
    const signing = generatePair();
    const published = generatePair();

    expect(() =>
      buildKeyRing(keyEnv(signing.privateKey, published.publicKey)),
    ).toThrow("JWT_PRIVATE_KEY does not match JWT_PUBLIC_KEY");
  });
});
