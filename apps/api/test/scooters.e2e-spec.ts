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
  let vinSeq = Math.floor(Math.random() * 7_000_000) + 1_000_000;

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
      engineCc: 125,
      powerKw: 8.5,
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
        engineCc: 125,
        powerKw: 8.5,
        purchasedOn: "2026-07-14",
        registrationType: "unregistered",
        plateNumber: null,
        registeredOn: null,
        registrationExpiresOn: null,
        requiredDriverLicenseType: "none",
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
    expect(electric.engineCc).toBeNull();

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
          engineCc: undefined,
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

  it("lets admins create registered scooters", async () => {
    const admin = await freshSession(["ADMIN"]);

    const nationalRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        scooterInput({
          registrationType: "national",
          plateNumber: "cj12abc",
          registeredOn: "2026-07-14",
          requiredDriverLicenseType: "A1",
        }),
      );
    expect(nationalRes.status).toBe(201);
    const national = v1.scooters.scooterSchema.parse(nationalRes.body);
    expect(national).toEqual(
      expect.objectContaining({
        registrationType: "national",
        plateNumber: "CJ 12 ABC",
        registeredOn: "2026-07-14",
        registrationExpiresOn: null,
        requiredDriverLicenseType: "A1",
      }),
    );

    const temporaryRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        scooterInput({
          registrationType: "temporary",
          plateNumber: "B 012345",
          registeredOn: "2026-07-14",
          registrationExpiresOn: "2026-08-14",
          requiredDriverLicenseType: "AM",
        }),
      );
    expect(temporaryRes.status).toBe(201);
    const temporary = v1.scooters.scooterSchema.parse(temporaryRes.body);
    expect(temporary).toEqual(
      expect.objectContaining({
        registrationType: "temporary",
        plateNumber: "B 012345",
        registrationExpiresOn: "2026-08-14",
        requiredDriverLicenseType: "AM",
      }),
    );

    const switchToNationalRes = await req()
      .patch(v1.scooters.ROUTES.update(temporary.id))
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        registrationType: "national",
        plateNumber: "B 46 XYZ",
        registeredOn: "2026-07-14",
        requiredDriverLicenseType: "A1",
      });
    expect(switchToNationalRes.status).toBe(200);
    expect(v1.scooters.scooterSchema.parse(switchToNationalRes.body)).toEqual(
      expect.objectContaining({
        registrationType: "national",
        plateNumber: "B 46 XYZ",
        registrationExpiresOn: null,
      }),
    );
  });

  it("lets admins add and clear scooter registration", async () => {
    const admin = await freshSession(["ADMIN"]);
    const createRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(scooterInput());
    const created = v1.scooters.scooterSchema.parse(createRes.body);
    expect(created.registrationType).toBe("unregistered");

    const registeredRes = await req()
      .patch(v1.scooters.ROUTES.update(created.id))
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        registrationType: "national",
        plateNumber: "B 45 XYZ",
        registeredOn: "2026-07-14",
        requiredDriverLicenseType: "A1",
      });
    expect(registeredRes.status).toBe(200);
    const registered = v1.scooters.scooterSchema.parse(registeredRes.body);
    expect(registered).toEqual(
      expect.objectContaining({
        registrationType: "national",
        plateNumber: "B 45 XYZ",
        registeredOn: "2026-07-14",
        requiredDriverLicenseType: "A1",
      }),
    );

    const clearRes = await req()
      .patch(v1.scooters.ROUTES.update(created.id))
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({ registrationType: "unregistered" });
    expect(clearRes.status).toBe(200);
    const cleared = v1.scooters.scooterSchema.parse(clearRes.body);
    expect(cleared).toEqual(
      expect.objectContaining({
        registrationType: "unregistered",
        plateNumber: null,
        registeredOn: null,
        registrationExpiresOn: null,
        requiredDriverLicenseType: "none",
      }),
    );
  });

  it("rejects duplicate active plates and allows reuse after soft delete", async () => {
    const admin = await freshSession(["ADMIN"]);

    const firstRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        scooterInput({
          registrationType: "national",
          plateNumber: "B 123 ABC",
          registeredOn: "2026-07-14",
          requiredDriverLicenseType: "A1",
        }),
      );
    expect(firstRes.status).toBe(201);
    const first = v1.scooters.scooterSchema.parse(firstRes.body);

    const duplicateRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        scooterInput({
          registrationType: "national",
          plateNumber: "B123ABC",
          registeredOn: "2026-07-14",
          requiredDriverLicenseType: "A1",
        }),
      );
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body).toMatchObject({
      error: {
        code: "SCOOTER_PLATE_CONFLICT",
        details: { field: "plateNumber" },
      },
    });

    const deleteRes = await req()
      .delete(v1.scooters.ROUTES.delete(first.id))
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(deleteRes.status).toBe(204);

    const reuseRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        scooterInput({
          registrationType: "national",
          plateNumber: "B 123 ABC",
          registeredOn: "2026-07-14",
          requiredDriverLicenseType: "A1",
        }),
      );
    expect(reuseRes.status).toBe(201);
  });

  it("searches by plate and filters by registration type", async () => {
    const admin = await freshSession(["ADMIN"]);
    const createRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        scooterInput({
          registrationType: "national",
          plateNumber: "CJ 34 DEF",
          registeredOn: "2026-07-14",
          requiredDriverLicenseType: "A1",
        }),
      );
    expect(createRes.status).toBe(201);
    const created = v1.scooters.scooterSchema.parse(createRes.body);

    const searchRes = await req()
      .get(`${v1.scooters.ROUTES.list}?search=CJ34DEF&page=1&pageSize=50`)
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(searchRes.status).toBe(200);
    const searchList = v1.scooters.scooterListSchema.parse(searchRes.body);
    expect(searchList.items.map((scooter) => scooter.id)).toContain(created.id);

    const filterRes = await req()
      .get(
        `${v1.scooters.ROUTES.list}?registrationType=national&page=1&pageSize=50`,
      )
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(filterRes.status).toBe(200);
    const filterList = v1.scooters.scooterListSchema.parse(filterRes.body);
    expect(filterList.items.map((scooter) => scooter.id)).toContain(created.id);
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

    const missingEngineCcRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        ...scooterInput(),
        powertrainType: "combustion",
        engineCc: undefined,
      });
    expect(missingEngineCcRes.status).toBe(400);

    const electricEngineCcRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        ...scooterInput(),
        powertrainType: "electric",
        engineCc: 125,
      });
    expect(electricEngineCcRes.status).toBe(400);

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
