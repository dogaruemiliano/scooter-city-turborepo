process.env.AUTH_EMAIL_OTP_ENABLED = "false";
process.env.AUTH_GOOGLE_ENABLED = "false";
process.env.AUTH_APPLE_ENABLED = "false";

import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";

describe("disabled auth method registry (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns an empty method list and omits disabled routes", async () => {
    const server = app.getHttpServer() as Server;
    const enabled = await request(server).get("/v1/auth/enabled-methods");

    expect(enabled.status).toBe(200);
    expect(v1.auth.enabledAuthMethodsSchema.parse(enabled.body)).toEqual({
      methods: [],
    });

    await request(server).post("/v1/auth/email-otp/request").expect(404);
    await request(server).post("/v1/auth/google").expect(404);
    await request(server).post("/v1/auth/apple").expect(404);
  });
});
