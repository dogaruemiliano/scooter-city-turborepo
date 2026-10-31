import { ImageStorageService } from "../src/image-storage/image-storage.service";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { ScooterDocumentExtractionService } from "../src/scooter-document-extraction/scooter-document-extraction.service";
import { ScooterDocumentDispatcherService } from "../src/scooter-document-jobs/scooter-document-dispatcher.service";
import { ScooterDocumentCleanupService } from "../src/scooter-document-jobs/scooter-document-cleanup.service";
import { ENV } from "../src/config/config.module";
import type { Env } from "../src/config/env";
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
    })
      // Exercise HTTP admission/persistence without scheduled AWS/provider work.
      .overrideProvider(ScooterDocumentDispatcherService)
      .useValue({})
      .overrideProvider(ScooterDocumentCleanupService)
      .useValue({})
      .compile();
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
      await prisma.userPermissionOverride.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
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
      loginStatus: "ACTIVE",
      isSuperAdmin: roles.includes("SUPER_ADMIN"),
      permissionOverrides: {
        create: roles.includes("ADMIN")
          ? v1.access.permissionCatalog
              .filter((p) => !p.key.startsWith("portal."))
              .map((p) => ({
                permissionKey: p.key,
                scopes: p.scopes.includes("ALL")
                  ? ["ALL" as const]
                  : [...p.scopes],
              }))
          : [],
      },
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

  it("saves manual ITP independently, keeps history, and requires an explicit passed result", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const created = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send(scooterInput())
      .expect(201);
    const scooter = v1.scooters.scooterSchema.parse(created.body);
    const input = {
      source: "manual",
      expectedLatestId: null,
      inspectionDate: null,
      validUntil: "2099-01-01",
      result: "unknown",
      cardDocumentId: null,
      certificateDocumentId: null,
      odometerKm: null,
      certificateNumber: null,
      evidenceReviewed: true,
    };
    await req()
      .post(v1.scooters.ROUTES.itp.create(scooter.id))
      .set("Cookie", cookie)
      .send({ ...input, evidenceReviewed: false })
      .expect(400);
    const first = await req()
      .post(v1.scooters.ROUTES.itp.create(scooter.id))
      .set("Cookie", cookie)
      .send(input)
      .expect(201)
      .then((response) =>
        v1.scooters.scooterItpInspectionSchema.parse(response.body),
      );
    expect(first).toMatchObject({
      source: "manual",
      inspectionDate: null,
      result: "unknown",
    });
    const needsReview = await req()
      .get(v1.scooters.ROUTES.get(scooter.id))
      .set("Cookie", cookie)
      .expect(200);
    expect(needsReview.body).toMatchObject({
      itpStatus: "review",
      itpValidUntil: "2099-01-01",
      insurancePolicies: [],
    });
    await req()
      .post(v1.scooters.ROUTES.itp.create(scooter.id))
      .set("Cookie", cookie)
      .send(input)
      .expect(409);
    const confirmed = await req()
      .post(v1.scooters.ROUTES.itp.create(scooter.id))
      .set("Cookie", cookie)
      .send({ ...input, expectedLatestId: first.id, result: "passed" })
      .expect(201)
      .then((response) =>
        v1.scooters.scooterItpInspectionSchema.parse(response.body),
      );
    const summary = await req()
      .get(v1.scooters.ROUTES.get(scooter.id))
      .set("Cookie", cookie)
      .expect(200)
      .then((response) => v1.scooters.scooterSchema.parse(response.body));
    expect(summary.itpStatus).toBe("active");
    const history = await req()
      .get(v1.scooters.ROUTES.itp.list(scooter.id))
      .set("Cookie", cookie)
      .expect(200)
      .then((response) =>
        v1.scooters.scooterItpListSchema.parse(response.body),
      );
    expect(history.inspections).toHaveLength(2);
    expect(history.inspections[0].id).toBe(confirmed.id);
    expect(summary.missingClientDocuments).toContain("itp_card");
  });

  it("saves just an ITP expiry without insurance fields and rejects empty insurance", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const created = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send(scooterInput())
      .expect(201);
    const scooter = v1.scooters.scooterSchema.parse(created.body);
    const saved = await req()
      .patch(v1.scooters.ROUTES.update(scooter.id))
      .set("Cookie", cookie)
      .send({
        itpValidUntil: "2027-12-31",
        expectedUpdatedAt: scooter.updatedAt,
      })
      .expect(200)
      .then((response) => v1.scooters.scooterSchema.parse(response.body));
    expect(saved).toMatchObject({
      itpValidUntil: "2027-12-31",
      insurancePolicies: [],
    });
    expect(saved.updatedAt).not.toBe(scooter.updatedAt);
    await req()
      .patch(v1.scooters.ROUTES.insurance.update(scooter.id))
      .set("Cookie", cookie)
      .send({
        expectedUpdatedAt: saved.updatedAt,
        source: "manual",
        policies: [
          {
            id: crypto.randomUUID(),
            insuredName: null,
            validFrom: null,
            validUntil: null,
            premiumAmount: null,
            currency: "RON",
            documentVin: null,
            vinReviewConfirmed: false,
          },
        ],
      })
      .expect(400);
    expect(
      await prisma.scooterInsurancePolicy.count({
        where: { scooterId: scooter.id },
      }),
    ).toBe(0);
  });

  it("commits ITP, insurance edits and staged removal in one scooter save", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const policy = {
      insuredName: "Fleet",
      validFrom: "2026-01-01",
      validUntil: "2027-01-01",
      premiumAmount: 0,
      currency: "RON",
      documentVin: null,
      vinReviewConfirmed: false,
    };
    const first = { ...policy, id: crypto.randomUUID() };
    const second = { ...policy, id: crypto.randomUUID() };
    const created = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send({ ...scooterInput(), insurancePolicies: [first, second] })
      .expect(201)
      .then((response) => v1.scooters.scooterSchema.parse(response.body));
    const id = created.id;
    const saved = await req()
      .patch(v1.scooters.ROUTES.update(id))
      .set("Cookie", cookie)
      .send({
        expectedUpdatedAt: created.updatedAt,
        itpValidUntil: "2028-01-01",
        color: "Red",
        insurancePolicies: [{ ...second, insuredName: "Updated Fleet" }],
        removedInsurancePolicyIds: [first.id],
      })
      .expect(200)
      .then((response) => v1.scooters.scooterSchema.parse(response.body));
    expect(saved).toMatchObject({
      color: "Red",
      itpValidUntil: "2028-01-01",
      insurancePolicies: [{ id: second.id, insuredName: "Updated Fleet" }],
    });
    expect(
      (
        await prisma.scooterInsurancePolicy.findUniqueOrThrow({
          where: { id: first.id },
        })
      ).deletedAt,
    ).not.toBeNull();
    await req()
      .patch(v1.scooters.ROUTES.update(id))
      .set("Cookie", cookie)
      .send({
        expectedUpdatedAt: saved.updatedAt,
        removedInsurancePolicyIds: [second.id],
      })
      .expect(409);
    expect(
      (
        await prisma.scooterInsurancePolicy.findUniqueOrThrow({
          where: { id: second.id },
        })
      ).deletedAt,
    ).toBeNull();
  });

  it("saves insurance independently with immutable revisions and rejects stale saves", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const created = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send(scooterInput())
      .expect(201);
    const scooter = v1.scooters.scooterSchema.parse(created.body);
    const policy = {
      id: crypto.randomUUID(),
      insuredName: "Manual policy",
      validFrom: "2026-01-01",
      validUntil: "2027-01-01",
      premiumAmount: 0,
      currency: "RON",
      documentVin: null,
      vinReviewConfirmed: true,
    };
    const payload = {
      policies: [policy],
      expectedUpdatedAt: scooter.updatedAt,
      source: "manual",
    };
    const first = await req()
      .patch(v1.scooters.ROUTES.insurance.update(scooter.id))
      .set("Cookie", cookie)
      .send(payload)
      .expect(200)
      .then((response) =>
        v1.scooters.scooterInsuranceListSchema.parse(response.body),
      );
    expect(first.policies[0].premiumAmount).toBe(0);
    expect(first.history[0]).toMatchObject({
      source: "manual",
      snapshot: { validUntil: "2027-01-01" },
    });
    await req()
      .patch(v1.scooters.ROUTES.insurance.update(scooter.id))
      .set("Cookie", cookie)
      .send({ ...payload, policies: [{ ...policy, validUntil: "2028-01-01" }] })
      .expect(409);
    const corrected = await req()
      .patch(v1.scooters.ROUTES.insurance.update(scooter.id))
      .set("Cookie", cookie)
      .send({
        ...payload,
        expectedUpdatedAt: first.updatedAt,
        policies: [{ ...policy, validUntil: "2028-01-01" }],
      })
      .expect(200)
      .then((response) =>
        v1.scooters.scooterInsuranceListSchema.parse(response.body),
      );
    expect(corrected.history.map((entry) => entry.snapshot.validUntil)).toEqual(
      ["2028-01-01", "2027-01-01"],
    );
    const summary = await req()
      .get(v1.scooters.ROUTES.get(scooter.id))
      .set("Cookie", cookie)
      .expect(200)
      .then((response) => v1.scooters.scooterSchema.parse(response.body));
    expect(summary.itpStatus).toBe("missing");
    await req()
      .delete(v1.scooters.ROUTES.insurance.delete(scooter.id, policy.id))
      .set("Cookie", cookie)
      .send({ expectedUpdatedAt: corrected.updatedAt })
      .expect(409);
    const replacement = {
      ...policy,
      id: crypto.randomUUID(),
      validFrom: "2028-01-01",
      validUntil: "2029-01-01",
    };
    const added = await req()
      .patch(v1.scooters.ROUTES.insurance.update(scooter.id))
      .set("Cookie", cookie)
      .send({
        source: "manual",
        expectedUpdatedAt: corrected.updatedAt,
        policies: [replacement],
      })
      .expect(200)
      .then((response) =>
        v1.scooters.scooterInsuranceListSchema.parse(response.body),
      );
    const deletion = await req()
      .delete(v1.scooters.ROUTES.insurance.delete(scooter.id, policy.id))
      .set("Cookie", cookie)
      .send({ expectedUpdatedAt: added.updatedAt })
      .expect(200)
      .then((response) =>
        v1.scooters.scooterInsuranceListSchema.parse(response.body),
      );
    expect(deletion.policies).toEqual([
      expect.objectContaining({ id: replacement.id }),
    ]);
    expect(deletion.history[0]).toMatchObject({
      action: "deleted",
      snapshot: { id: policy.id, validUntil: "2028-01-01" },
    });
    expect(
      (
        await prisma.scooterInsurancePolicy.findUniqueOrThrow({
          where: { id: policy.id },
        })
      ).deletedAt,
    ).not.toBeNull();
  });

  it("preserves insurance history and prices, checks VIN changes and rejects foreign policies", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const input = scooterInput();
    const policy = {
      id: crypto.randomUUID(),
      insuredName: "Test Asigurat SRL",
      validFrom: "2025-01-01",
      validUntil: "2025-12-31",
      premiumAmount: 250.55,
      currency: "RON",
      documentVin: input.vin,
      vinReviewConfirmed: false,
    };
    const created = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send({ ...input, insurancePolicies: [policy] })
      .expect(201);
    const vehicle = v1.scooters.scooterSchema.parse(created.body);
    expect(vehicle.insurancePolicies).toEqual([
      expect.objectContaining(policy),
    ]);
    const path = v1.scooters.ROUTES.update(vehicle.id);
    const renewal = {
      ...policy,
      id: crypto.randomUUID(),
      validFrom: "2026-01-01",
      validUntil: "2026-12-31",
      premiumAmount: 312.4,
    };
    const renewed = await req()
      .patch(path)
      .set("Cookie", cookie)
      .send({ insurancePolicies: [renewal] })
      .expect(200);
    expect(
      v1.scooters.scooterSchema.parse(renewed.body).insurancePolicies,
    ).toHaveLength(2);
    await req()
      .patch(path)
      .set("Cookie", cookie)
      .send({ notes: "Keep both policies" })
      .expect(200);
    await req()
      .patch(path)
      .set("Cookie", cookie)
      .send({ vin: uniqueVin() })
      .expect(400);
    const other = scooterInput();
    await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send({
        ...other,
        insurancePolicies: [{ ...policy, documentVin: other.vin }],
      })
      .expect(400);
    expect(
      await prisma.scooter.findUnique({ where: { vin: other.vin } }),
    ).toBeNull();
    const detail = await req().get(path).set("Cookie", cookie).expect(200);
    expect(
      v1.scooters.scooterSchema.parse(detail.body).insurancePolicies,
    ).toHaveLength(2);
    expect(
      v1.scooters.scooterSchema.parse(detail.body).insurancePolicies,
    ).toContainEqual(
      expect.objectContaining({ id: policy.id, premiumAmount: 250.55 }),
    );
  });

  it("links an insurance PDF to its policy atomically and protects its private content", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const storageKey = `test-insurance-${crypto.randomUUID()}/policy.pdf`;
    const stored = {
      provider: "s3" as const,
      bucket: "test-private",
      storageKey,
      contentType: "application/pdf" as const,
      byteSize: 9,
      checksumSha256: "a".repeat(64),
      imageWidth: null,
      imageHeight: null,
      pageCount: null,
    };
    await prisma.draftUpload.create({
      data: {
        userId: admin.userId,
        provider: stored.provider,
        bucket: stored.bucket,
        storageKey,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        purpose: "scooter-document:insurance",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const complete = jest
      .spyOn(app.get(ImageStorageService), "completePresignedDocumentUpload")
      .mockResolvedValue(stored);
    let scooterId: string | undefined;
    try {
      const input = scooterInput();
      const id = crypto.randomUUID();
      const policy = {
        id,
        insuredName: "Test Insured",
        validFrom: null,
        validUntil: null,
        premiumAmount: null,
        currency: null,
        documentVin: input.vin,
        vinReviewConfirmed: false,
      };
      const draft = {
        type: "insurance",
        insurancePolicyId: id,
        fileName: "policy.pdf",
        uploadToken: "token",
      };
      await req()
        .post(v1.scooters.ROUTES.create)
        .set("Cookie", cookie)
        .send({ ...input, documentDrafts: [draft] })
        .expect(400);
      expect(
        await prisma.draftUpload.findUnique({ where: { storageKey } }),
      ).toMatchObject({ claimedAt: null });
      const created = await req()
        .post(v1.scooters.ROUTES.create)
        .set("Cookie", cookie)
        .send({
          ...input,
          insurancePolicies: [policy],
          documentDrafts: [draft],
        })
        .expect(201);
      scooterId = v1.scooters.scooterSchema.parse(created.body).id;
      const detail = await req()
        .get(v1.scooters.ROUTES.get(scooterId))
        .set("Cookie", cookie)
        .expect(200)
        .then((response) => v1.scooters.scooterSchema.parse(response.body));
      expect(detail.documents).toEqual([
        expect.objectContaining({ type: "insurance", insurancePolicyId: id }),
      ]);
      await req().get(detail.documents![0].contentUrl).expect(401);
      const replacement = {
        ...policy,
        id: crypto.randomUUID(),
        insuredName: "Replacement policy",
      };
      const added = await req()
        .patch(v1.scooters.ROUTES.insurance.update(scooterId))
        .set("Cookie", cookie)
        .send({
          source: "manual",
          expectedUpdatedAt: detail.updatedAt,
          policies: [replacement],
        })
        .expect(200)
        .then((response) =>
          v1.scooters.scooterInsuranceListSchema.parse(response.body),
        );
      const deleted = await req()
        .delete(v1.scooters.ROUTES.insurance.delete(scooterId, id))
        .set("Cookie", cookie)
        .send({ expectedUpdatedAt: added.updatedAt })
        .expect(200)
        .then((response) =>
          v1.scooters.scooterInsuranceListSchema.parse(response.body),
        );
      expect(deleted.policies).toEqual([
        expect.objectContaining({ id: replacement.id }),
      ]);
      const retained = await req()
        .get(v1.scooters.ROUTES.get(scooterId))
        .set("Cookie", cookie)
        .expect(200)
        .then((response) => v1.scooters.scooterSchema.parse(response.body));
      expect(retained.documents).toEqual([
        expect.objectContaining({ insurancePolicyId: id }),
      ]);
      expect(
        (await prisma.mediaAsset.findUniqueOrThrow({ where: { storageKey } }))
          .deletedAt,
      ).toBeNull();
      expect(complete).toHaveBeenCalledWith(
        "token",
        `scooter-document:insurance:${admin.userId}`,
      );
    } finally {
      complete.mockRestore();
      if (scooterId)
        await prisma.scooterDocument.deleteMany({ where: { scooterId } });
      await prisma.mediaAsset.deleteMany({ where: { storageKey } });
      await prisma.draftUpload.deleteMany({ where: { storageKey } });
    }
  });

  it("keeps per-file import evidence separate from CIV and preserves optional operational values", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const input = scooterInput({
      hasGps: false,
      odometerWorking: null,
      speedometerWorking: true,
      actualMaxSpeedKmh: 0,
    });
    const storageKey = `test-import-${crypto.randomUUID()}/import.pdf`;
    const stored = {
      provider: "s3" as const,
      bucket: "test-private",
      storageKey,
      contentType: "application/pdf" as const,
      byteSize: 9,
      checksumSha256: "a".repeat(64),
      imageWidth: null,
      imageHeight: null,
      pageCount: null,
    };
    await prisma.draftUpload.create({
      data: {
        userId: admin.userId,
        provider: stored.provider,
        bucket: stored.bucket,
        storageKey,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        purpose: "scooter-document:import_document",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const complete = jest
      .spyOn(app.get(ImageStorageService), "completePresignedDocumentUpload")
      .mockResolvedValue(stored);
    let scooterId: string | undefined;
    try {
      const extractedData = {
        vin: input.vin,
        fields: { brandName: "KYMCO", powerKw: 2.68 },
        rawFields: { power: "2,68", missing: "-", unreadable: null },
      };
      const created = await req()
        .post(v1.scooters.ROUTES.create)
        .set("Cookie", cookie)
        .send({
          ...input,
          documentDrafts: [
            {
              type: "import_document",
              fileName: "import.pdf",
              uploadToken: "token",
              extractedData,
            },
          ],
        })
        .expect(201);
      const scooter = v1.scooters.scooterSchema.parse(created.body);
      scooterId = scooter.id;
      expect(scooter).toMatchObject({
        hasGps: false,
        odometerWorking: null,
        speedometerWorking: true,
        actualMaxSpeedKmh: 0,
      });
      expect(scooter.civRawFields).toBeNull();
      const path = v1.scooters.ROUTES.get(scooterId);
      const detail = await req().get(path).set("Cookie", cookie).expect(200);
      const document = v1.scooters.scooterSchema.parse(detail.body)
        .documents![0];
      expect(document).toMatchObject({
        type: "import_document",
        extractedData,
      });
      const other = await req()
        .post(v1.scooters.ROUTES.create)
        .set("Cookie", cookie)
        .send(scooterInput())
        .expect(201);
      const otherId = v1.scooters.scooterSchema.parse(other.body).id;
      await req()
        .patch(v1.scooters.ROUTES.update(otherId))
        .set("Cookie", cookie)
        .send({
          hasGps: true,
          documentExtractions: [
            { documentId: document.id, extractedData: null },
          ],
        })
        .expect(400);
      expect(
        (await prisma.scooter.findUniqueOrThrow({ where: { id: otherId } }))
          .hasGps,
      ).toBeNull();
      const edited = await req()
        .patch(path)
        .set("Cookie", cookie)
        .send({
          hasGps: null,
          odometerWorking: false,
          actualMaxSpeedKmh: 31,
          documentExtractions: [
            {
              documentId: document.id,
              extractedData: {
                ...extractedData,
                fields: { ...extractedData.fields, model: "V7" },
              },
            },
          ],
        })
        .expect(200);
      expect(v1.scooters.scooterSchema.parse(edited.body)).toMatchObject({
        hasGps: null,
        odometerWorking: false,
        speedometerWorking: true,
        actualMaxSpeedKmh: 31,
      });
      const updated = await req().get(path).set("Cookie", cookie).expect(200);
      expect(
        v1.scooters.scooterSchema.parse(updated.body).documents![0]
          .extractedData?.fields.model,
      ).toBe("V7");
      await req()
        .patch(path)
        .set("Cookie", cookie)
        .send({ actualMaxSpeedKmh: -1 })
        .expect(400);
      await req()
        .patch(path)
        .set("Cookie", cookie)
        .send({
          documentExtractions: [
            { documentId: document.id, extractedData: null },
          ],
        })
        .expect(200);
      expect(
        (
          await prisma.scooterDocument.findUniqueOrThrow({
            where: { id: document.id },
          })
        ).extractedData,
      ).toBeNull();
    } finally {
      complete.mockRestore();
      if (scooterId)
        await prisma.scooterDocument.deleteMany({ where: { scooterId } });
      await prisma.mediaAsset.deleteMany({ where: { storageKey } });
      await prisma.draftUpload.deleteMany({ where: { storageKey } });
    }
  });

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
        maxBytes: v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES,
      });
    try {
      for (const invalid of [
        { type: "unknown" },
        { contentType: "image/svg+xml" },
        { byteSize: 0 },
        { byteSize: v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES + 1 },
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
        .send({ ...input, byteSize: v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES })
        .expect(201);
      expect(sign).toHaveBeenCalledWith(
        expect.objectContaining({
          byteSize: v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES,
        }),
      );
      expect(
        v1.scooters.scooterDocumentUploadSchema.parse(result.body),
      ).toMatchObject({
        uploadToken: "signed-token",
        maxBytes: v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES,
      });
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

  it("keeps synchronous extraction retired without reading files or invoking AI", async () => {
    const admin = await freshSession(["ADMIN"]);
    const read = jest.spyOn(app.get(ImageStorageService), "readDocument");
    const analyze = jest.spyOn(
      app.get(ScooterDocumentExtractionService),
      "analyze",
    );
    try {
      const response = await req()
        .post(v1.scooters.ROUTES.documents.extract)
        .set("Cookie", [`access_token=${admin.accessToken}`])
        .send({
          sourceId: "legacy-source",
          source: { kind: "draft", type: "civ", uploadToken: "test-token" },
        })
        .expect(503);
      expect(response.body).toMatchObject({
        error: { code: "DOCUMENT_EXTRACTION_DISABLED" },
      });
      expect(read).not.toHaveBeenCalled();
      expect(analyze).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      analyze.mockRestore();
    }
  });

  it("queues only authorized usable drafts without reading files, claiming uploads or saving scooters", async () => {
    const route = v1.scooters.ROUTES.documents.startExtractionJob;
    const admin = await freshSession(["ADMIN"]);
    const member = await freshSession(["USER"]);
    const otherAdmin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const otherCookie = [`access_token=${otherAdmin.accessToken}`];
    const sessionResponse = await req()
      .post(v1.scooters.ROUTES.documents.createEditorSession)
      .set("Cookie", cookie)
      .expect(201);
    const session = v1.scooters.scooterDocumentEditorSessionSchema.parse(
      sessionResponse.body,
    );
    const input: v1.scooters.StartScooterDocumentExtractionJobInput = {
      sessionId: session.id,
      attemptId: crypto.randomUUID(),
      sourceId: "browser-source-id",
      source: { kind: "draft", type: "civ", uploadToken: "test-token" },
    };
    await req().post(route).send(input).expect(401);
    await req()
      .post(route)
      .set("Cookie", [`access_token=${member.accessToken}`])
      .send(input)
      .expect(403);
    await request(server())
      .post(route)
      .set("Cookie", cookie)
      .send(input)
      .expect(403);
    const bytes = Buffer.from("ffd8ffe00000", "hex");
    const stored = {
      provider: "s3" as const,
      bucket: app.get<Env>(ENV).IMAGE_STORAGE_S3_BUCKET!,
      storageKey: `test-scooter-extraction-${Date.now()}/civ.jpg`,
      contentType: "image/jpeg" as const,
      byteSize: bytes.length,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const baseline = {
      userId: admin.userId,
      editorSessionId: session.id,
      purpose: "scooter-document:civ",
      // Queued work leases the upload through the editor session's expiry.
      expiresAt: new Date(session.expiresAt),
      claimedAt: null,
      cleanupStartedAt: null,
      checksumSha256: stored.checksumSha256,
    };
    const draft = await prisma.draftUpload.create({
      data: { ...stored, ...baseline },
    });
    const storage = app.get(ImageStorageService);
    const verify = jest
      .spyOn(storage, "verifyDocumentUploadToken")
      .mockReturnValue({
        ...stored,
        imageWidth: null,
        imageHeight: null,
        pageCount: null,
      });
    const read = jest.spyOn(storage, "readDocument");
    const analyze = jest.spyOn(
      app.get(ScooterDocumentExtractionService),
      "analyze",
    );
    const env = app.get<Env>(ENV);
    const wasEnabled = env.SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED;
    try {
      env.SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED = false;
      await req().post(route).set("Cookie", cookie).send(input).expect(503);
      expect(verify).not.toHaveBeenCalled();
      env.SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED = true;
      const scooterCount = await prisma.scooter.count();
      const assetCount = await prisma.mediaAsset.count();
      const response = await req()
        .post(route)
        .set("Cookie", cookie)
        .send(input)
        .expect(202);
      const job = v1.scooters.scooterDocumentExtractionJobSchema.parse(
        response.body,
      );
      expect(job).toMatchObject({
        sourceId: input.sourceId,
        documentType: "civ",
        status: "queued",
      });
      expect(job.result).toBeUndefined();
      expect(verify).toHaveBeenCalledWith(
        "test-token",
        `scooter-document:civ:${admin.userId}`,
      );
      expect(
        await prisma.scooterDocumentJob.findUniqueOrThrow({
          where: { id: job.id },
        }),
      ).toMatchObject({
        sessionId: session.id,
        draftUploadId: draft.id,
        userId: admin.userId,
      });
      expect(
        (
          await prisma.draftUpload.findUniqueOrThrow({
            where: { id: draft.id },
          })
        ).claimedAt,
      ).toBeNull();
      expect(await prisma.scooter.count()).toBe(scooterCount);
      expect(await prisma.mediaAsset.count()).toBe(assetCount);
      const repeated = await req()
        .post(route)
        .set("Cookie", cookie)
        .send(input)
        .expect(202);
      expect(
        v1.scooters.scooterDocumentExtractionJobSchema.parse(repeated.body).id,
      ).toBe(job.id);
      expect(
        await prisma.scooterDocumentJob.count({
          where: { sessionId: session.id },
        }),
      ).toBe(1);
      const statusRoute = v1.scooters.ROUTES.documents.extractionJob(job.id);
      await req().get(statusRoute).expect(401);
      await req().get(statusRoute).set("Cookie", otherCookie).expect(404);
      const status = await req()
        .get(statusRoute)
        .set("Cookie", cookie)
        .expect(200);
      expect(
        v1.scooters.scooterDocumentExtractionJobSchema.parse(status.body),
      ).toEqual(job);
      const cancelRoute = v1.scooters.ROUTES.documents.cancelExtractionJob(
        job.id,
      );
      await req().post(cancelRoute).set("Cookie", otherCookie).expect(404);
      const cancelled = await req()
        .post(cancelRoute)
        .set("Cookie", cookie)
        .expect(200);
      expect(
        v1.scooters.scooterDocumentExtractionJobSchema.parse(cancelled.body)
          .status,
      ).toBe("cancelled");
      for (const invalid of [
        { expiresAt: new Date(Date.now() - 60_000) },
        {
          expiresAt: new Date(new Date(session.expiresAt).getTime() - 1_000),
        },
        { claimedAt: new Date() },
        { cleanupStartedAt: new Date() },
        { userId: member.userId },
        { purpose: "scooter-document:insurance" },
        { checksumSha256: "0".repeat(64) },
        { editorSessionId: null },
      ]) {
        await prisma.draftUpload.update({
          where: { id: draft.id },
          data: { ...baseline, ...invalid },
        });
        await req()
          .post(route)
          .set("Cookie", cookie)
          .send({ ...input, attemptId: crypto.randomUUID() })
          .expect(400);
      }
      await req()
        .post(route)
        .set("Cookie", cookie)
        .send({
          ...input,
          attemptId: crypto.randomUUID(),
          source: {
            kind: "saved",
            scooterId: "unrelated",
            documentId: "missing",
          },
        })
        .expect(404);
      await req()
        .post(route)
        .set("Cookie", cookie)
        .send({
          ...input,
          attemptId: crypto.randomUUID(),
          source: { ...input.source, url: "https://untrusted.example/file" },
        })
        .expect(400);
      expect(
        await prisma.scooterDocumentJob.count({
          where: { sessionId: session.id },
        }),
      ).toBe(1);
      expect(read).not.toHaveBeenCalled();
      expect(analyze).not.toHaveBeenCalled();
    } finally {
      env.SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED = wasEnabled;
      verify.mockRestore();
      read.mockRestore();
      analyze.mockRestore();
      await prisma.scooterDocumentJob.deleteMany({
        where: { sessionId: session.id },
      });
      await prisma.draftUpload.delete({ where: { id: draft.id } });
      await prisma.scooterDocumentEditorSession.delete({
        where: { id: session.id },
      });
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

  it("returns compact insurance attention on both list paths and clears it after renewal", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const input = scooterInput();
    const policy = {
      id: crypto.randomUUID(),
      insuredName: "Example SRL",
      validFrom: "2000-01-01",
      validUntil: "2000-12-31",
      premiumAmount: 100,
      currency: "RON",
      documentVin: input.vin,
      vinReviewConfirmed: false,
    };
    const created = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send({ ...input, insurancePolicies: [policy] })
      .expect(201);
    const scooter = v1.scooters.scooterSchema.parse(created.body);
    async function checkAttention(expected: "expired" | null) {
      for (const search of [undefined, input.vin]) {
        const response = await req()
          .get(v1.scooters.ROUTES.list)
          // The fixture follows the seeded inventory in ascending fleet order.
          // Request the newest scooter so this covers both list paths even
          // when the database contains more than one page of seed data.
          .query({ search, sort: "fleetNumberDesc", pageSize: 1 })
          .set("Cookie", cookie)
          .expect(200);
        const item = v1.scooters.scooterListSchema
          .parse(response.body)
          .items.find((item) => item.id === scooter.id);
        expect(item).toBeDefined();
        expect(item?.insuranceAttention).toBe(expected);
        expect(item).not.toHaveProperty("insurancePolicies");
      }
    }
    await checkAttention("expired");
    await req()
      .patch(v1.scooters.ROUTES.update(scooter.id))
      .set("Cookie", cookie)
      .send({
        insurancePolicies: [
          {
            ...policy,
            id: crypto.randomUUID(),
            validFrom: v1.common.dateOnlyToday(),
            validUntil: v1.common.dateOnlyToday(),
          },
        ],
      })
      .expect(200);
    await checkAttention(null);
  });

  it("allocates consecutive global fleet numbers under concurrent creation and rolls back failures", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const before = await prisma.scooterFleetCounter.findUniqueOrThrow({
      where: { id: 1 },
    });
    const inputs = Array.from({ length: 4 }, (_, index) =>
      scooterInput({
        brandId: index % 2 ? hondaBrand.id : yamahaBrand.id,
      }),
    );
    const responses = await Promise.all(
      inputs.map((input) =>
        req().post(v1.scooters.ROUTES.create).set("Cookie", cookie).send(input),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([
      201, 201, 201, 201,
    ]);
    const numbers = responses.map(
      (response) => v1.scooters.scooterSchema.parse(response.body).fleetNumber,
    );
    expect(numbers.sort((a, b) => a - b)).toEqual(
      [1, 2, 3, 4].map((n) => before.lastNumber + n),
    );

    const duplicate = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send(inputs[0]);
    expect(duplicate.status).toBe(409);
    const next = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send(scooterInput());
    expect(next.status).toBe(201);
    expect(v1.scooters.scooterSchema.parse(next.body).fleetNumber).toBe(
      before.lastNumber + 5,
    );
  });

  it("previews without reserving and safely handles concurrent manual overrides", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const before = await prisma.scooterFleetCounter.findUniqueOrThrow({
      where: { id: 1 },
    });
    for (let i = 0; i < 2; i++) {
      const preview = await req()
        .get(v1.scooters.ROUTES.nextFleetNumber)
        .set("Cookie", cookie);
      expect(preview.status).toBe(200);
      expect(
        v1.scooters.nextScooterFleetNumberSchema.parse(preview.body)
          .fleetNumber,
      ).toBe(before.lastNumber + 1);
    }
    expect(
      (await prisma.scooterFleetCounter.findUniqueOrThrow({ where: { id: 1 } }))
        .lastNumber,
    ).toBe(before.lastNumber);
    const chosen = before.lastNumber + 10;
    const input = scooterInput();
    const responses = await Promise.all(
      [input, scooterInput()].map((body) =>
        req()
          .post(v1.scooters.ROUTES.create)
          .set("Cookie", cookie)
          .send({ ...body, fleetNumber: chosen }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const duplicate = responses.find((response) => response.status === 409)!;
    expect(duplicate.body).toMatchObject({
      error: {
        code: "SCOOTER_FLEET_NUMBER_CONFLICT",
        details: { field: "fleetNumber" },
      },
    });
    const created = v1.scooters.scooterSchema.parse(
      responses.find((response) => response.status === 201)!.body,
    );
    expect(created.fleetNumber).toBe(chosen);
    // Filling an unused lower number must never rewind the automatic counter.
    const lower = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send({ ...scooterInput(), fleetNumber: chosen - 1 });
    expect(lower.status).toBe(201);
    const failed = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send({ ...scooterInput(), vin: created.vin, fleetNumber: chosen + 20 });
    expect(failed.status).toBe(409);
    expect(
      (await prisma.scooterFleetCounter.findUniqueOrThrow({ where: { id: 1 } }))
        .lastNumber,
    ).toBe(chosen);
    const automatic = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send(scooterInput());
    expect(automatic.status).toBe(201);
    expect(v1.scooters.scooterSchema.parse(automatic.body).fleetNumber).toBe(
      chosen + 1,
    );
  });

  it("persists fuel systems and clears them when propulsion changes", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const created = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send({ ...scooterInput(), fuelSystem: "injection" })
      .expect(201);
    const scooter = v1.scooters.scooterSchema.parse(created.body);
    expect(scooter.fuelSystem).toBe("injection");
    const path = v1.scooters.ROUTES.update(scooter.id);
    const edited = await req()
      .patch(path)
      .set("Cookie", cookie)
      .send({ fuelSystem: "carburetor" })
      .expect(200);
    expect(v1.scooters.scooterSchema.parse(edited.body).fuelSystem).toBe(
      "carburetor",
    );
    await req()
      .patch(path)
      .set("Cookie", cookie)
      .send({ powertrainType: "electric" })
      .expect(400);
    const electric = await req()
      .patch(path)
      .set("Cookie", cookie)
      .send({
        powertrainType: "electric",
        fuelSystem: null,
        engineDisplacementCc: null,
      })
      .expect(200);
    expect(
      v1.scooters.scooterSchema.parse(electric.body).fuelSystem,
    ).toBeNull();
    await req()
      .patch(path)
      .set("Cookie", cookie)
      .send({ fuelSystem: "injection" })
      .expect(400);
  });

  it("edits internal numbers, rejects duplicates, and advances automatic numbering", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const create = async () => {
      const response = await req()
        .post(v1.scooters.ROUTES.create)
        .set("Cookie", cookie)
        .send(scooterInput())
        .expect(201);
      return v1.scooters.scooterSchema.parse(response.body);
    };
    const first = await create();
    const second = await create();
    const counter = await prisma.scooterFleetCounter.findUniqueOrThrow({
      where: { id: 1 },
    });
    const chosen = counter.lastNumber + 10;
    const path = v1.scooters.ROUTES.update(first.id);
    const response = await req()
      .patch(path)
      .set("Cookie", cookie)
      .send({ fleetNumber: chosen })
      .expect(200);
    expect(v1.scooters.scooterSchema.parse(response.body).fleetNumber).toBe(
      chosen,
    );
    await req()
      .patch(path)
      .set("Cookie", cookie)
      .send({ fleetNumber: chosen })
      .expect(200);
    const conflict = await req()
      .patch(v1.scooters.ROUTES.update(second.id))
      .set("Cookie", cookie)
      .send({ fleetNumber: chosen })
      .expect(409);
    expect((conflict.body as { error: unknown }).error).toMatchObject({
      code: "SCOOTER_FLEET_NUMBER_CONFLICT",
      details: { field: "fleetNumber" },
    });
    expect((await create()).fleetNumber).toBe(chosen + 1);
    await req()
      .patch(path)
      .set("Cookie", cookie)
      .send({ fleetNumber: first.fleetNumber })
      .expect(200);
    expect((await create()).fleetNumber).toBe(chosen + 2);
    for (const fleetNumber of [0, -1, 1.5, null])
      await req()
        .patch(path)
        .set("Cookie", cookie)
        .send({ fleetNumber })
        .expect(400);
  });

  it("keeps fleet numbers through brand changes and deletion, and searches by fleet identity", async () => {
    const admin = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${admin.accessToken}`];
    const createdRes = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send(scooterInput());
    expect(createdRes.status).toBe(201);
    const created = v1.scooters.scooterSchema.parse(createdRes.body);
    const changed = await req()
      .patch(v1.scooters.ROUTES.update(created.id))
      .set("Cookie", cookie)
      .send({ brandId: hondaBrand.id });
    expect(changed.status).toBe(200);
    const updated = v1.scooters.scooterSchema.parse(changed.body);
    expect(updated.fleetNumber).toBe(created.fleetNumber);
    expect(updated.brandCode).not.toBe(created.brandCode);

    for (const search of [
      String(updated.fleetNumber),
      String(updated.fleetNumber).padStart(3, "0"),
      v1.scooters.scooterDisplayCode(updated).toLowerCase().replace(" ", "   "),
    ]) {
      const res = await req()
        .get(v1.scooters.ROUTES.list)
        .query({ search })
        .set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(v1.scooters.scooterListSchema.parse(res.body).items[0]?.id).toBe(
        updated.id,
      );
    }
    for (const search of [undefined, updated.brandCode]) {
      for (const sort of [
        undefined,
        "fleetNumberAsc",
        "fleetNumberDesc",
      ] as const) {
        if (search && !sort) continue;
        const res = await req()
          .get(v1.scooters.ROUTES.list)
          .query({ search, sort, pageSize: 100 })
          .set("Cookie", cookie);
        expect(res.status).toBe(200);
        const numbers = v1.scooters.scooterListSchema
          .parse(res.body)
          .items.map((s) => s.fleetNumber);
        expect(numbers).toEqual(
          [...numbers].sort((a, b) =>
            sort === "fleetNumberDesc" ? b - a : a - b,
          ),
        );
      }
    }

    expect(
      (
        await req()
          .patch(v1.scooters.ROUTES.update(created.id))
          .set("Cookie", cookie)
          .send({ fleetNumber: created.fleetNumber })
      ).status,
    ).toBe(200);
    expect(
      (
        await req()
          .delete(v1.scooters.ROUTES.delete(created.id))
          .set("Cookie", cookie)
      ).status,
    ).toBe(204);
    const next = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", cookie)
      .send(scooterInput());
    expect(v1.scooters.scooterSchema.parse(next.body).fleetNumber).toBe(
      created.fleetNumber + 1,
    );
    await prisma.scooter.update({
      where: { id: created.id },
      data: { deletedAt: null },
    });
    const restored = await req()
      .get(v1.scooters.ROUTES.get(created.id))
      .set("Cookie", cookie);
    expect(v1.scooters.scooterSchema.parse(restored.body).fleetNumber).toBe(
      created.fleetNumber,
    );
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

  it("lets admins add and clear scooter registration while preserving the selected licence policy", async () => {
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
        requiredLicenseCategory: "A1",
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
