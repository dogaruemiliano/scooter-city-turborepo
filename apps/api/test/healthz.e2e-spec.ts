import {
  INestApplication,
  VersioningType,
  ValidationPipe,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";

interface HealthResponse {
  status: string;
  info: Record<string, { status: string }>;
  details: Record<string, { status: string }>;
}

describe("healthz (e2e)", () => {
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

  it("GET /healthz → 200 with status:ok", async () => {
    const res = await request(server()).get("/healthz");
    const body = res.body as HealthResponse;
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.info.memory_heap?.status).toBe("up");
    expect(body.info.db?.status).toBe("up"); // Prisma SELECT 1 against the test DB
  });

  it("echoes incoming X-Request-Id header", async () => {
    const res = await request(server())
      .get("/healthz")
      .set("x-request-id", "test-request-id-123");
    expect(res.headers["x-request-id"]).toBe("test-request-id-123");
  });

  it("generates a UUID request id when none provided", async () => {
    const res = await request(server()).get("/healthz");
    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
