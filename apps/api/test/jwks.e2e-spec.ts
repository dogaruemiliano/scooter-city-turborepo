/**
 * /.well-known/jwks.json — shape, headers, and key-rotation behavior.
 *
 * Asserts the contract first-party verifiers depend on:
 *
 *   - Public, no auth (`@Public()` on the controller).
 *   - Returns `{ keys: [...] }` with RSA JWK members + use/alg/kid.
 *   - `Cache-Control: public, max-age=3600, must-revalidate` set.
 *   - When JWT_PUBLIC_KEY_PREVIOUS is set, both keys appear (current first).
 */
import {
  INestApplication,
  VersioningType,
  ValidationPipe,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import request from "supertest";

import { AppModule } from "../src/app.module";

interface JwkResponse {
  keys: Array<{
    kty: string;
    use?: string;
    alg?: string;
    kid?: string;
    n?: string;
    e?: string;
  }>;
}

describe("jwks (e2e)", () => {
  let app: INestApplication;
  const server = () => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /.well-known/jwks.json → 200 with RSA JWK + cache header", async () => {
    const res = await request(server()).get("/.well-known/jwks.json");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe(
      "public, max-age=3600, must-revalidate",
    );
    const body = res.body as JwkResponse;
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys.length).toBeGreaterThanOrEqual(1);
    const [first] = body.keys;
    expect(first.kty).toBe("RSA");
    expect(first.alg).toBe("RS256");
    expect(first.use).toBe("sig");
    expect(typeof first.kid).toBe("string");
    expect(typeof first.n).toBe("string");
    expect(typeof first.e).toBe("string");
  });

  it("does not require auth", async () => {
    const res = await request(server())
      .get("/.well-known/jwks.json")
      .set("authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(200);
  });
});

describe("jwks key rotation (e2e)", () => {
  let app: INestApplication;
  const server = () => app.getHttpServer() as Server;
  const prevPrivate = process.env.JWT_PRIVATE_KEY;
  const prevPublic = process.env.JWT_PUBLIC_KEY;

  beforeAll(async () => {
    // Generate a second keypair and inject as "previous" so the JWKS
    // factory builds two entries. The current pair stays untouched.
    const { publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    process.env.JWT_PUBLIC_KEY_PREVIOUS =
      Buffer.from(publicKey).toString("base64");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    delete process.env.JWT_PUBLIC_KEY_PREVIOUS;
    if (prevPrivate !== undefined) process.env.JWT_PRIVATE_KEY = prevPrivate;
    if (prevPublic !== undefined) process.env.JWT_PUBLIC_KEY = prevPublic;
    await app.close();
  });

  it("publishes both current and previous keys with distinct kids", async () => {
    const res = await request(server()).get("/.well-known/jwks.json");
    const body = res.body as JwkResponse;
    expect(body.keys.length).toBe(2);
    const kids = body.keys.map((k) => k.kid);
    expect(new Set(kids).size).toBe(2);
  });
});
