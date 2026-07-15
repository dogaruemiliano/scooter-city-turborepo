/**
 * HTTP-level e2e tests for the admin-managed `/v1/scooters` endpoints.
 */
import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { CoreAuthService } from "../src/auth/modules/core-auth/core-auth.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

interface IssuedSession {
  accessToken: string;
  userId: string;
}

describe("Scooters HTTP surface (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let coreAuth: CoreAuthService;

  const createdUserIds: string[] = [];
  const createdVins: string[] = [];
  let vinSeq = 1_000_000;

  const server = () => app.getHttpServer() as Server;

  type RequestBuilder = ReturnType<ReturnType<typeof request>["get"]>;
  const req = (): {
    get: (path: string) => RequestBuilder;
    post: (path: string) => RequestBuilder;
    patch: (path: string) => RequestBuilder;
    delete: (path: string) => RequestBuilder;
  } => {
    const base = request(server());
    const tag = (b: RequestBuilder) => b.set("x-requested-with", "fetch");
    return {
      get: (p) => tag(base.get(p)),
      post: (p) => tag(base.post(p)),
      patch: (p) => tag(base.patch(p)),
      delete: (p) => tag(base.delete(p)),
    };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    users = app.get(UsersService);
    coreAuth = app.get(CoreAuthService);
  });

  afterAll(async () => {
    if (prisma && createdVins.length > 0) {
      await prisma.scooter.deleteMany({
        where: { vin: { in: createdVins } },
      });
    }
    if (prisma && createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app?.close();
  });

  async function freshSession(roles: string[]): Promise<IssuedSession> {
    const user = await users.createOne({
      email: `scooters-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      roles,
    });
    createdUserIds.push(user.id);
    const issued = await coreAuth.issueSession({ user });
    return {
      accessToken: issued.accessToken,
      userId: user.id,
    };
  }

  function uniqueVin(): string {
    vinSeq += 1;
    const vin = `LXYTCKP05P${String(vinSeq).padStart(7, "0")}`;
    createdVins.push(vin);
    return vin;
  }

  function scooterInput(
    overrides: Partial<v1.scooters.CreateScooterInput> = {},
  ): v1.scooters.CreateScooterInput {
    return {
      vin: uniqueVin(),
      brand: "Yamaha",
      model: "NMAX 125",
      color: "blue",
      manufactureYear: 2025,
      powertrainType: "combustion",
      cylinderCapacityCc: 125,
      purchasedOn: "2026-07-14",
      notes: "Factory papers received.",
      ...overrides,
    };
  }

  it("requires an admin user", async () => {
    const unauthenticatedRes = await req()
      .post(v1.scooters.ROUTES.create)
      .send(scooterInput());
    expect(unauthenticatedRes.status).toBe(401);

    const user = await freshSession(["USER"]);
    const nonAdminRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${user.accessToken}`])
      .send(scooterInput());
    expect(nonAdminRes.status).toBe(403);
  });

  it("lets admins create, read, update, and soft-delete scooters", async () => {
    const admin = await freshSession(["ADMIN"]);
    const input = scooterInput();

    const createRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(input);
    expect(createRes.status).toBe(201);
    const created = v1.scooters.scooterSchema.parse(createRes.body);
    expect(created).toEqual(
      expect.objectContaining({
        vin: input.vin,
        brand: "Yamaha",
        model: "NMAX 125",
        color: "blue",
        manufactureYear: 2025,
        powertrainType: "combustion",
        cylinderCapacityCc: 125,
        purchasedOn: "2026-07-14",
        registrationStatus: "unregistered",
        deletedAt: null,
      }),
    );

    const getRes = await req()
      .get(v1.scooters.ROUTES.get(created.id))
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(getRes.status).toBe(200);
    expect(v1.scooters.scooterSchema.parse(getRes.body).id).toBe(created.id);

    const updateRes = await req()
      .patch(v1.scooters.ROUTES.update(created.id))
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        color: "matte black",
        notes: "Updated maker paper copy.",
      });
    expect(updateRes.status).toBe(200);
    const updated = v1.scooters.scooterSchema.parse(updateRes.body);
    expect(updated.color).toBe("matte black");
    expect(updated.notes).toBe("Updated maker paper copy.");

    const electricRes = await req()
      .patch(v1.scooters.ROUTES.update(created.id))
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        powertrainType: "electric",
      });
    expect(electricRes.status).toBe(200);
    const electric = v1.scooters.scooterSchema.parse(electricRes.body);
    expect(electric.powertrainType).toBe("electric");
    expect(electric.cylinderCapacityCc).toBeNull();

    const deleteRes = await req()
      .delete(v1.scooters.ROUTES.delete(created.id))
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(deleteRes.status).toBe(204);

    const getDeletedRes = await req()
      .get(v1.scooters.ROUTES.get(created.id))
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(getDeletedRes.status).toBe(404);

    const hiddenListRes = await req()
      .get(`${v1.scooters.ROUTES.list}?search=${encodeURIComponent(input.vin)}`)
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    const hiddenList = v1.scooters.scooterListSchema.parse(hiddenListRes.body);
    expect(hiddenList.items.some((scooter) => scooter.id === created.id)).toBe(
      false,
    );

    const deletedListRes = await req()
      .get(
        `${v1.scooters.ROUTES.list}?includeDeleted=true&search=${encodeURIComponent(input.vin)}`,
      )
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    const deletedList = v1.scooters.scooterListSchema.parse(
      deletedListRes.body,
    );
    const deleted = deletedList.items.find(
      (scooter) => scooter.id === created.id,
    );
    expect(deleted).toBeDefined();
    expect(deleted?.deletedAt).not.toBeNull();

    const deleteAgainRes = await req()
      .delete(v1.scooters.ROUTES.delete(created.id))
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(deleteAgainRes.status).toBe(404);
  });

  it("lists scooters with trigram fuzzy search and filters", async () => {
    const admin = await freshSession(["ADMIN"]);
    const yamahaRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(scooterInput({ brand: "Yamaha", model: "NMAX 125" }));
    const hondaRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        scooterInput({
          brand: "Honda",
          model: "PCX Electric",
          powertrainType: "electric",
          cylinderCapacityCc: undefined,
        }),
      );
    const yamaha = v1.scooters.scooterSchema.parse(yamahaRes.body);
    const honda = v1.scooters.scooterSchema.parse(hondaRes.body);

    const fuzzyRes = await req()
      .get(`${v1.scooters.ROUTES.list}?search=yamah&page=1&pageSize=50`)
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(fuzzyRes.status).toBe(200);
    const fuzzyList = v1.scooters.scooterListSchema.parse(fuzzyRes.body);
    expect(fuzzyList.items.map((scooter) => scooter.id)).toContain(yamaha.id);
    expect(fuzzyList.items.map((scooter) => scooter.id)).not.toContain(
      honda.id,
    );

    const electricRes = await req()
      .get(
        `${v1.scooters.ROUTES.list}?powertrainType=electric&page=1&pageSize=50`,
      )
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    const electricList = v1.scooters.scooterListSchema.parse(electricRes.body);
    expect(electricList.items.map((scooter) => scooter.id)).toContain(honda.id);
    expect(electricList.items.map((scooter) => scooter.id)).not.toContain(
      yamaha.id,
    );
  });

  it("rejects duplicate VINs and invalid powertrain payloads", async () => {
    const admin = await freshSession(["ADMIN"]);
    const input = scooterInput();

    const createRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(input);
    expect(createRes.status).toBe(201);

    const duplicateRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({ ...scooterInput(), vin: input.vin });
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body).toMatchObject({
      error: {
        code: "SCOOTER_VIN_CONFLICT",
      },
    });

    const missingCylinderRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        ...scooterInput(),
        powertrainType: "combustion",
        cylinderCapacityCc: undefined,
      });
    expect(missingCylinderRes.status).toBe(400);

    const electricCylinderRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        ...scooterInput(),
        powertrainType: "electric",
        cylinderCapacityCc: 125,
      });
    expect(electricCylinderRes.status).toBe(400);

    const invalidVinRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        ...scooterInput(),
        vin: "INVALID",
      });
    expect(invalidVinRes.status).toBe(400);
  });
});
