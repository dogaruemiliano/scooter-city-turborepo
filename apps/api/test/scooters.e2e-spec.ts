import { ImageStorageService } from "../src/image-storage/image-storage.service";
import { Readable } from "node:stream";
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
  const createdBrandIds: string[] = [];
  let vinSeq = Math.floor(Math.random() * 7_000_000) + 1_000_000;
  let yamahaBrand: { id: string; name: string };
  let hondaBrand: { id: string; name: string };

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

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    yamahaBrand = await createBrand(
      `Yamaha-${suffix}`,
      `YAM${suffix.slice(-3)}`,
    );
    hondaBrand = await createBrand(`Honda-${suffix}`, `HON${suffix.slice(-3)}`);
  });

  afterAll(async () => {
    if (prisma && createdVins.length > 0) {
      await prisma.scooter.deleteMany({
        where: { vin: { in: createdVins } },
      });
    }
    if (prisma && createdBrandIds.length > 0) {
      await prisma.scooterBrand.deleteMany({
        where: { id: { in: createdBrandIds } },
      });
    }
    if (prisma && createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app?.close();
  });

  async function createBrand(
    name: string,
    code: string,
  ): Promise<{ id: string; name: string }> {
    const brand = await prisma.scooterBrand.create({ data: { name, code } });
    createdBrandIds.push(brand.id);
    return { id: brand.id, name: brand.name };
  }

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
      brandId: yamahaBrand.id,
      model: "NMAX 125",
      color: "blue",
      manufactureYear: 2025,
      powertrainType: "combustion",
      engineDisplacementCc: 125,
      powerKw: 8.5,
      notes: "Factory papers received.",
      ...overrides,
    };
  }

  it("round-trips general vehicle CIV data and preserves original fields on partial updates", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const rawFields = {
      "13": "ENG-123",
      "N.5": "-",
      unmapped: "Original text",
    };
    const created = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send(
        scooterInput({
          vehicleCategory: "M3",
          vehicleClass: "III",
          engineDisplacementCc: 12800,
          powerKw: 350.125,
          maxAxle3MassKg: 8000,
          maxAxle4MassKg: null,
          maxAxle5MassKg: null,
          brakedTrailerMassKg: 3500,
          unbrakedTrailerMassKg: 750,
          standingCapacity: 0,
          stationaryNoiseDb: 82.125,
          co2EmissionsGKm: 120.25,
          driveType: "4x2",
          civVersion: "2024",
          civIssuedAt: "2024-06-10",
          civIssuingAuthority: "RAR București",
          civRawFields: rawFields,
          civMentions: "Official CIV mentions",
          notes: "Operational note",
        }),
      )
      .expect(201);
    const vehicle = v1.scooters.scooterSchema.parse(created.body);
    expect(vehicle).toMatchObject({
      vehicleCategory: "M3",
      civVersion: "2024",
      civIssuedAt: "2024-06-10",
      maxAxle5MassKg: null,
      standingCapacity: 0,
      powerKw: 350.125,
      civRawFields: rawFields,
    });
    const list = await req()
      .get(v1.scooters.ROUTES.list)
      .query({ search: vehicle.vin })
      .set("Cookie", cookie)
      .expect(200);
    expect(
      v1.scooters.scooterListSchema.parse(list.body).items[0],
    ).not.toHaveProperty("civRawFields");
    const updated = await req()
      .patch(v1.scooters.ROUTES.update(vehicle.id))
      .set("Cookie", cookie)
      .send({ civVersion: "2016", notes: "Changed operational note" })
      .expect(200);
    expect(v1.scooters.scooterSchema.parse(updated.body)).toMatchObject({
      civVersion: "2016",
      civIssuedAt: "2024-06-10",
      civRawFields: rawFields,
      civMentions: "Official CIV mentions",
      stationaryNoiseDb: 82.125,
    });
    await req().get(v1.vehicleCiv.CIV_ROUTES.vocabulary).expect(401);
    const vocabulary = await req()
      .get(v1.vehicleCiv.CIV_ROUTES.vocabulary)
      .set("Cookie", cookie)
      .expect(200);
    expect(v1.vehicleCiv.civVocabularySchema.parse(vocabulary.body)).toEqual(
      expect.arrayContaining([
        { field: "driveType", value: "4x2" },
        { field: "vehicleClass", value: "III" },
      ]),
    );
    await req()
      .patch(v1.scooters.ROUTES.update(vehicle.id))
      .set("Cookie", cookie)
      .send({ maxAxle3MassKg: -1 })
      .expect(400);
    const cleared = await req()
      .patch(v1.scooters.ROUTES.update(vehicle.id))
      .set("Cookie", cookie)
      .send({ civRawFields: null, maxAxle3MassKg: null, civIssuedAt: null })
      .expect(200);
    expect(v1.scooters.scooterSchema.parse(cleared.body)).toMatchObject({
      civRawFields: null,
      maxAxle3MassKg: null,
      civIssuedAt: null,
      civVersion: "2016",
    });
    const trailer = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send({
        vin: uniqueVin(),
        brandId: yamahaBrand.id,
        vehicleCategory: "O2",
        powertrainType: "unpowered",
        axlesCount: 2,
      })
      .expect(201);
    expect(v1.scooters.scooterSchema.parse(trailer.body)).toMatchObject({
      civVersion: "unknown",
      powerKw: null,
      engineDisplacementCc: null,
    });
  });

  it("authorizes and validates draft upload requests before signing private uploads", async () => {
    const admin = await freshSession(["ADMIN"]);
    const input = {
      type: "civ",
      contentType: "application/pdf",
      byteSize: 9,
      checksumSha256: "a".repeat(64),
    };
    const route = v1.scooters.ROUTES.documents.createDraftUpload;
    await req().post(route).send(input).expect(401);
    const member = await freshSession(["USER"]);
    await req()
      .post(route)
      .set("Cookie", [`access_token=${member.accessToken}`])
      .send(input)
      .expect(403);
    const cookie = [`access_token=${admin.accessToken}`];
    const storageKey = `test-scooter-${Date.now()}/draft.pdf`;
    const sign = jest
      .spyOn(app.get(ImageStorageService), "createPresignedDocumentUpload")
      .mockResolvedValue({
        provider: "s3",
        bucket: "test-private",
        storageKey,
        uploadUrl: "https://storage.example.com/upload",
        uploadToken: "signed-token",
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        expiresAt: new Date(Date.now() + 60_000),
        uploadTokenExpiresAt: new Date(Date.now() + 86_400_000),
        maxBytes: 10_485_760,
      });
    try {
      for (const invalid of [
        { type: "insurance" },
        { contentType: "image/svg+xml" },
        { byteSize: 0 },
        { byteSize: 10_485_761 },
      ]) {
        await req()
          .post(route)
          .set("Cookie", cookie)
          .send({ ...input, ...invalid })
          .expect(400);
      }
      expect(sign).not.toHaveBeenCalled();
      const result = await req()
        .post(route)
        .set("Cookie", cookie)
        .send(input)
        .expect(201);
      expect(
        v1.scooters.scooterDocumentUploadSchema.parse(result.body).uploadToken,
      ).toBe("signed-token");
      expect(
        await prisma.draftUpload.findUnique({ where: { storageKey } }),
      ).toMatchObject({
        userId: admin.userId,
        purpose: "scooter-document:civ",
        claimedAt: null,
      });
    } finally {
      sign.mockRestore();
      await prisma.draftUpload.deleteMany({ where: { storageKey } });
    }
  });

  it("saves CIV and certificate drafts atomically, streams private content, and rolls back invalid edits", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const storage = app.get(ImageStorageService);
    const keys = [
      `test-scooter-${Date.now()}/civ.pdf`,
      `test-scooter-${Date.now()}/front.jpg`,
    ];
    const stored = keys.map((storageKey, index) => ({
      provider: "s3" as const,
      bucket: "test-private",
      storageKey,
      contentType: index
        ? ("image/jpeg" as const)
        : ("application/pdf" as const),
      byteSize: 9,
      checksumSha256: "a".repeat(64),
      imageWidth: null,
      imageHeight: null,
      pageCount: null,
    }));
    for (const [index, asset] of stored.entries()) {
      await prisma.draftUpload.create({
        data: {
          userId: admin.userId,
          provider: asset.provider,
          bucket: asset.bucket,
          storageKey: asset.storageKey,
          contentType: asset.contentType,
          byteSize: asset.byteSize,
          checksumSha256: asset.checksumSha256,
          purpose: index
            ? "scooter-document:registration_certificate"
            : "scooter-document:civ",
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
    }
    const complete = jest
      .spyOn(storage, "completePresignedDocumentUpload")
      .mockImplementation((token) => Promise.resolve(stored[Number(token)]));
    const read = jest.spyOn(storage, "readDocument").mockImplementation(() =>
      Promise.resolve({
        body: Readable.from(Buffer.from("%PDF-test")),
        contentType: "application/pdf",
        contentLength: 9,
      }),
    );
    try {
      const documentDrafts: v1.scooters.ScooterDocumentDraft[] = [
        { type: "civ", fileName: "CIV.pdf", uploadToken: "0" },
        {
          type: "registration_certificate",
          fileName: "front.jpg",
          uploadToken: "1",
        },
      ];
      const otherAdmin = await freshSession(["ADMIN"]);
      const foreignVin = uniqueVin();
      await req()
        .post(v1.scooters.ROUTES.create)
        .set("Cookie", [`access_token=${otherAdmin.accessToken}`])
        .send(scooterInput({ vin: foreignVin, documentDrafts }))
        .expect(400);
      expect(
        await prisma.scooter.findUnique({ where: { vin: foreignVin } }),
      ).toBeNull();
      const created = await req()
        .post(v1.scooters.ROUTES.create)
        .set("Cookie", cookie)
        .send(scooterInput({ documentDrafts }));
      expect(created.status).toBe(201);
      const id = v1.scooters.scooterSchema.parse(created.body).id;
      const detail = await req()
        .get(v1.scooters.ROUTES.get(id))
        .set("Cookie", cookie)
        .expect(200);
      const savedDocuments = v1.scooters.scooterSchema.parse(
        detail.body,
      ).documents!;
      expect(savedDocuments).toHaveLength(2);
      expect(JSON.stringify(detail.body)).not.toContain('"asset"');
      expect(JSON.stringify(detail.body)).not.toContain('"storageKey"');
      expect(complete).toHaveBeenCalledWith(
        "0",
        `scooter-document:civ:${admin.userId}`,
      );
      expect(complete).toHaveBeenCalledWith(
        "1",
        `scooter-document:registration_certificate:${admin.userId}`,
      );
      const contentUrl = savedDocuments[0].contentUrl;
      await req().get(contentUrl).expect(401);
      const member = await freshSession(["USER"]);
      await req()
        .get(contentUrl)
        .set("Cookie", [`access_token=${member.accessToken}`])
        .expect(403);
      const content = await req()
        .get(contentUrl)
        .set("Cookie", cookie)
        .expect(200);
      expect(content.headers["cache-control"]).toBe("private, no-store");
      expect(content.headers["x-content-type-options"]).toBe("nosniff");
      const reusedVin = uniqueVin();
      await req()
        .post(v1.scooters.ROUTES.create)
        .set("Cookie", cookie)
        .send(scooterInput({ vin: reusedVin, documentDrafts }))
        .expect(400);
      expect(
        await prisma.scooter.findUnique({ where: { vin: reusedVin } }),
      ).toBeNull();
      const removedDocumentIds = [savedDocuments[0].id];
      await req()
        .patch(v1.scooters.ROUTES.update(id))
        .set("Cookie", cookie)
        .send({ color: "red", documentDrafts, removedDocumentIds })
        .expect(400);
      const unchanged = await req()
        .get(v1.scooters.ROUTES.get(id))
        .set("Cookie", cookie)
        .expect(200);
      expect(v1.scooters.scooterSchema.parse(unchanged.body).color).toBe(
        "blue",
      );
      expect(
        v1.scooters.scooterSchema.parse(unchanged.body).documents,
      ).toHaveLength(2);
      const other = await req()
        .post(v1.scooters.ROUTES.create)
        .set("Cookie", cookie)
        .send(scooterInput())
        .expect(201);
      await req()
        .patch(
          v1.scooters.ROUTES.update(
            v1.scooters.scooterSchema.parse(other.body).id,
          ),
        )
        .set("Cookie", cookie)
        .send({ removedDocumentIds })
        .expect(400);
      await req()
        .patch(v1.scooters.ROUTES.update(id))
        .set("Cookie", cookie)
        .send({ removedDocumentIds })
        .expect(200);
      await req().get(contentUrl).set("Cookie", cookie).expect(404);
      await req()
        .delete(v1.scooters.ROUTES.delete(id))
        .set("Cookie", cookie)
        .expect(204);
      await req()
        .get(savedDocuments[1].contentUrl)
        .set("Cookie", cookie)
        .expect(404);
    } finally {
      complete.mockRestore();
      read.mockRestore();
      await prisma.scooterDocument.deleteMany({
        where: { asset: { storageKey: { in: keys } } },
      });
      await prisma.mediaAsset.deleteMany({
        where: { storageKey: { in: keys } },
      });
      await prisma.draftUpload.deleteMany({
        where: { storageKey: { in: keys } },
      });
    }
  });

  it("creates incomplete scooters, fills technical data and clears it without losing unrelated fields", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const created = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send({
        vin: uniqueVin(),
        brandId: yamahaBrand.id,
        powertrainType: "combustion",
      });
    expect(created.status).toBe(201);
    const createdScooter = v1.scooters.scooterSchema.parse(created.body);
    expect(created.body).toMatchObject({
      model: null,
      manufactureYear: null,
      engineDisplacementCc: null,
      powerKw: null,
    });
    const details = {
      variant: "test-value",
      version: "test-value",
      commercialName: "test-value",
      vehicleCategory: "other",
      vehicleCategoryOther: "test-value",
      nationalCategory: "other",
      nationalCategoryOther: "test-value",
      bodyType: "other",
      bodyTypeOther: "test-value",
      typeApprovalNumber: "test-value",
      nationalRegistryNumber: "TEST-VALUE",
      seatsCount: 12,
      engineSerialNumber: "test-value",
      ratedEngineRpm: 12,
      fuelType: "other",
      fuelTypeOther: "test-value",
      propulsionSystem: "test-value",
      electricMotorPowerKw: 0.125,
      powertrainType: "hybrid",
      powerToWeightRatioKwKg: 0.125,
      maxSpeedKmh: 12,
      emissionsStandard: "test-value",
      curbWeightKg: 12,
      actualWeightKg: 12,
      maxTechnicallyPermissibleMassKg: 12,
      maxTrainMassKg: 12,
      maxAxle1MassKg: 12,
      maxAxle2MassKg: 12,
      axlesCount: 12,
      lengthMm: 12,
      widthMm: 12,
      heightMm: 12,
      wheelbaseMm: 12,
      frontTyreSpecification: "test-value",
      rearTyreSpecification: "test-value",
      frontSuspension: "test-value",
      rearSuspension: "test-value",
      fuelTankCapacityLiters: 0.125,
      registrationCertificateNumber: "test-value",
    };
    const filled = await req()
      .patch(v1.scooters.ROUTES.update(createdScooter.id))
      .set("Cookie", cookie)
      .send({
        ...details,
        model: "NMAX",
        manufactureYear: 2025,
        engineDisplacementCc: 125,
        powerKw: 9.5,
      });
    expect(filled.status).toBe(200);
    expect(filled.body).toMatchObject({ ...details, powerKw: 9.5 });
    expect(v1.scooters.scooterSchema.safeParse(filled.body).success).toBe(true);
    const noted = await req()
      .patch(v1.scooters.ROUTES.update(createdScooter.id))
      .set("Cookie", cookie)
      .send({ notes: "Pending registration" });
    expect(noted.status).toBe(200);
    expect(noted.body).toMatchObject(details);
    const clearedFields = Object.fromEntries(
      Object.keys(details)
        .filter((key) => key !== "powertrainType")
        .map((key) => [key, null]),
    );
    const cleared = await req()
      .patch(v1.scooters.ROUTES.update(createdScooter.id))
      .set("Cookie", cookie)
      .send({
        ...clearedFields,
        model: null,
        manufactureYear: null,
        engineDisplacementCc: null,
        powerKw: null,
      });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({
      ...clearedFields,
      model: null,
      manufactureYear: null,
      engineDisplacementCc: null,
      powerKw: null,
      notes: "Pending registration",
    });
    const stored = await prisma.scooter.findUniqueOrThrow({
      where: { id: createdScooter.id },
    });
    expect(stored).toMatchObject({
      ...clearedFields,
      model: null,
      manufactureYear: null,
    });
  });

  it("enforces CIV enums and requires explicit clearing when changing propulsion", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const created = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send({
        vin: uniqueVin(),
        brandId: yamahaBrand.id,
        powertrainType: "hybrid",
        fuelType: "petrol_electric",
        engineDisplacementCc: 125,
        fuelTankCapacityLiters: 5.5,
        electricMotorPowerKw: 3.25,
        bodyType: "other",
        bodyTypeOther: "Legacy CIV body",
        vehicleType: "TYPE-1",
        civNumber: "CIV-1",
        nationalEmissionsCode: "E5",
      });
    expect(created.status).toBe(201);
    const path = v1.scooters.ROUTES.update(
      v1.scooters.scooterSchema.parse(created.body).id,
    );
    for (const json of [
      { bodyType: "invented" },
      { fuelType: "other" },
      { powertrainType: "electric" },
      { bodyType: "two_wheel_moped" },
    ]) {
      expect(
        (await req().patch(path).set("Cookie", cookie).send(json)).status,
      ).toBe(400);
    }
    const unchanged = await req().get(path).set("Cookie", cookie);
    expect(unchanged.body).toMatchObject({
      powertrainType: "hybrid",
      engineDisplacementCc: 125,
      bodyTypeOther: "Legacy CIV body",
    });
    const electric = await req().patch(path).set("Cookie", cookie).send({
      powertrainType: "electric",
      engineDisplacementCc: null,
      fuelTankCapacityLiters: null,
      nationalEmissionsCode: null,
      fuelType: "electric",
      bodyType: "two_wheel_moped",
      bodyTypeOther: null,
    });
    expect(electric.status).toBe(200);
    expect(electric.body).toMatchObject({
      powertrainType: "electric",
      electricMotorPowerKw: 3.25,
      bodyType: "two_wheel_moped",
      bodyTypeOther: null,
      vehicleType: "TYPE-1",
      civNumber: "CIV-1",
    });
    expect(
      (
        await req()
          .patch(path)
          .set("Cookie", cookie)
          .send({ fuelType: "petrol" })
      ).status,
    ).toBe(400);
  });

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

  it("does not expose retired service and repair endpoints", async () => {
    const admin = await freshSession(["ADMIN"]);
    const createRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(scooterInput());
    expect(createRes.status).toBe(201);
    const scooter = v1.scooters.scooterSchema.parse(createRes.body);

    for (const path of [
      "/v1/maintenance/types",
      "/v1/maintenance/issues",
      "/v1/maintenance/schedule",
      "/v1/maintenance/dashboard",
      `/v1/scooters/${scooter.id}/issues`,
      `/v1/scooters/${scooter.id}/maintenance-records`,
      `/v1/scooters/${scooter.id}/maintenance-overview`,
    ]) {
      const response = await req()
        .get(path)
        .set("Cookie", [`access_token=${admin.accessToken}`]);
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
    }

    const reportIssueRes = await req()
      .post(`/v1/scooters/${scooter.id}/issues`)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({ title: "Retired endpoint", severity: "LOW" });
    expect(reportIssueRes.status).toBe(404);
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
        brandId: yamahaBrand.id,
        brand: yamahaBrand.name,
        model: "NMAX 125",
        color: "blue",
        manufactureYear: 2025,
        powertrainType: "combustion",
        engineDisplacementCc: 125,
        powerKw: 8.5,
        registrationType: "unregistered",
        registrationNumber: null,
        registrationDate: null,
        temporaryRegistrationExpiresAt: null,
        requiredLicenseCategory: "none",
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
        engineDisplacementCc: null,
      });
    expect(electricRes.status).toBe(200);
    const electric = v1.scooters.scooterSchema.parse(electricRes.body);
    expect(electric.powertrainType).toBe("electric");
    expect(electric.engineDisplacementCc).toBeNull();

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
      .send(scooterInput({ brandId: yamahaBrand.id, model: "NMAX 125" }));
    const hondaRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        scooterInput({
          brandId: hondaBrand.id,
          model: "PCX Electric",
          powertrainType: "electric",
          engineDisplacementCc: undefined,
        }),
      );
    const yamaha = v1.scooters.scooterSchema.parse(yamahaRes.body);
    const honda = v1.scooters.scooterSchema.parse(hondaRes.body);

    const fuzzyRes = await req()
      .get(`${v1.scooters.ROUTES.list}?search=yamah&page=1&pageSize=50`)
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(fuzzyRes.status).toBe(200);
    for (const item of (fuzzyRes.body as { items: unknown[] }).items) {
      expect(item).not.toHaveProperty("attentionSummary");
    }
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
          registrationNumber: "cj12abc",
          registrationDate: "2026-07-14",
          requiredLicenseCategory: "A1",
        }),
      );
    expect(nationalRes.status).toBe(201);
    const national = v1.scooters.scooterSchema.parse(nationalRes.body);
    expect(national).toEqual(
      expect.objectContaining({
        registrationType: "national",
        registrationNumber: "CJ 12 ABC",
        registrationDate: "2026-07-14",
        temporaryRegistrationExpiresAt: null,
        requiredLicenseCategory: "A1",
      }),
    );

    const temporaryRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        scooterInput({
          registrationType: "temporary",
          registrationNumber: "B 012345",
          registrationDate: "2026-07-14",
          temporaryRegistrationExpiresAt: "2026-08-14",
          requiredLicenseCategory: "AM",
        }),
      );
    expect(temporaryRes.status).toBe(201);
    const temporary = v1.scooters.scooterSchema.parse(temporaryRes.body);
    expect(temporary).toEqual(
      expect.objectContaining({
        registrationType: "temporary",
        registrationNumber: "B 012345",
        temporaryRegistrationExpiresAt: "2026-08-14",
        requiredLicenseCategory: "AM",
      }),
    );

    const switchToNationalRes = await req()
      .patch(v1.scooters.ROUTES.update(temporary.id))
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        registrationType: "national",
        registrationNumber: "B 46 XYZ",
        registrationDate: "2026-07-14",
        requiredLicenseCategory: "A1",
      });
    expect(switchToNationalRes.status).toBe(200);
    expect(v1.scooters.scooterSchema.parse(switchToNationalRes.body)).toEqual(
      expect.objectContaining({
        registrationType: "national",
        registrationNumber: "B 46 XYZ",
        temporaryRegistrationExpiresAt: null,
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
        registrationNumber: "B 45 XYZ",
        registrationDate: "2026-07-14",
        requiredLicenseCategory: "A1",
      });
    expect(registeredRes.status).toBe(200);
    const registered = v1.scooters.scooterSchema.parse(registeredRes.body);
    expect(registered).toEqual(
      expect.objectContaining({
        registrationType: "national",
        registrationNumber: "B 45 XYZ",
        registrationDate: "2026-07-14",
        requiredLicenseCategory: "A1",
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
        registrationNumber: null,
        registrationDate: null,
        temporaryRegistrationExpiresAt: null,
        requiredLicenseCategory: "none",
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
          registrationNumber: "B 123 ABC",
          registrationDate: "2026-07-14",
          requiredLicenseCategory: "A1",
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
          registrationNumber: "B123ABC",
          registrationDate: "2026-07-14",
          requiredLicenseCategory: "A1",
        }),
      );
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body).toMatchObject({
      error: {
        code: "SCOOTER_PLATE_CONFLICT",
        details: { field: "registrationNumber" },
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
          registrationNumber: "B 123 ABC",
          registrationDate: "2026-07-14",
          requiredLicenseCategory: "A1",
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
          registrationNumber: "CJ 34 DEF",
          registrationDate: "2026-07-14",
          requiredLicenseCategory: "A1",
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
        engineDisplacementCc: undefined,
      });
    expect(missingEngineCcRes.status).toBe(201);
    expect(
      v1.scooters.scooterSchema.parse(missingEngineCcRes.body)
        .engineDisplacementCc,
    ).toBeNull();

    const electricEngineCcRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        ...scooterInput(),
        powertrainType: "electric",
        engineDisplacementCc: 125,
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
