process.env.AUTH_EMAIL_OTP_ENABLED = "true";
process.env.AUTH_GOOGLE_ENABLED = "true";
process.env.AUTH_APPLE_ENABLED = "true";
process.env.APPLE_SERVICE_ID = "test.apple.service";

import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";

describe("enabled auth method registry (e2e)", () => {
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

  it("returns all enabled methods and registers their routes", async () => {
    const server = app.getHttpServer() as Server;
    const enabled = await request(server).get("/v1/auth/enabled-methods");

    expect(enabled.status).toBe(200);
    expect(v1.auth.enabledAuthMethodsSchema.parse(enabled.body)).toEqual({
      methods: ["emailOtp", "google", "apple"],
    });

    await request(server)
      .post("/v1/auth/email-otp/request")
      .send({})
      .expect(400);
    await request(server).post("/v1/auth/google").send({}).expect(400);
    await request(server).post("/v1/auth/apple").send({}).expect(400);
  });
});
