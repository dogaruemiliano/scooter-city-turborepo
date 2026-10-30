import { createCanvas } from "@napi-rs/canvas";
import { Readable } from "node:stream";
import { RentalMediaService } from "../rentals/rental-media.service";
import { assertVehicleDocumentsMutable } from "../scooters/scooter-contract-evidence";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { v1 } from "@repo/api-shared";
import { PrismaClient } from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";
import type { Logger } from "nestjs-pino";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { Env } from "../config/env";
import { RentalsService } from "../rentals/rentals.service";
import { prefillRentalInspection } from "../rentals/rental-inspection";
import { ContractSupport, DOCX_MIME, digest } from "./contract-support";
import { TemplatesService } from "./templates.service";
import {
  assertPackageCurrent,
  packageSourceFingerprint,
} from "./package-integrity";
import {
  BASE_DOCUMENT_ORDER,
  REGISTRY_VERSION,
  RENDERER_VERSION,
} from "./engine/registry";
import { validateDocxTemplate } from "./engine/docx-engine";

// Never load DATABASE_URL or silently fall back to any application database.
const databaseUrl = process.env.TEST_CONTRACT_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("contract workflow against isolated PostgreSQL", () => {
  let prisma: PrismaClient;
  let support: ContractSupport;
  let templates: TemplatesService;
  let rentals: RentalsService;
  let userId: string;
  let personId: string;
  let identityId: string;
  let companyId: string;
  let bookId: string;
  let brandId: string;
  let sourceAssetId: string;
  let setIds: string[] = [];
  const versionIds: Record<string, string> = {};
  const rentalIds: string[] = [];
  const scooterIds: string[] = [];
  const prefix = `contract-integration-${randomUUID()}`;
  const commandKeys: string[] = [];
  const access = {
    getSnapshot: jest
      .fn()
      .mockResolvedValue({ isSuperAdmin: true, effectiveScopes: {} }),
  } as unknown as AccessService;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
      !parsed.pathname.includes("test")
    )
      throw new Error(
        "Integration requires an explicitly named local test database",
      );
    // Verified against Prisma 7 docs: generated client + mandatory adapter, explicit pg pool settings.
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl!,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      }),
    });
    await prisma.$connect();
    if (await prisma.financeBook.findUnique({ where: { type: "COMPANY" } }))
      throw new Error(
        "Use a fresh isolated contract test database; no existing company data is modified",
      );
    userId = (
      await prisma.user.create({
        data: {
          email: `${prefix}@example.invalid`,
          firstName: "Fixture",
          lastName: "Operator",
          loginStatus: "ACTIVE",
        },
      })
    ).id;
    personId = (
      await prisma.person.create({
        data: {
          userId,
          email: `${prefix}-person@example.invalid`,
          phone: `+40${Date.now()}`,
          firstName: "Client",
          lastName: "Synthetic",
          dateOfBirth: new Date("1990-01-01T00:00:00Z"),
        },
      })
    ).id;
    identityId = (
      await prisma.personDocument.create({
        data: {
          personId,
          type: "nationalId",
          number: "TESTONLY",
          status: "verified",
          expiresOn: new Date("2030-12-31T00:00:00Z"),
        },
      })
    ).id;
    brandId = (
      await prisma.scooterBrand.create({
        data: { name: prefix, code: `T${randomUUID()}` },
      })
    ).id;
    bookId = (
      await prisma.financeBook.create({
        data: { type: "COMPANY", name: prefix },
      })
    ).id;
    companyId = (
      await prisma.financeLegalIdentity.create({
        data: {
          bookId,
          legalName: prefix,
          normalizedLegalName: prefix,
          taxIdentifier: prefix,
          normalizedTaxIdentifier: prefix,
        },
      })
    ).id;
    await prisma.contractSettings.create({ data: { companyId, data: {} } });
    const audit = new AuditService(
      prisma as unknown as PrismaService,
      { error: jest.fn() } as unknown as Logger,
    );
    support = new ContractSupport(
      prisma as unknown as PrismaService,
      access,
      {} as ImageStorageService,
      audit,
    );
    templates = new TemplatesService(support, {} as Env);
    rentals = new RentalsService(
      prisma as unknown as PrismaService,
      access,
      audit,
    );
    for (const type of BASE_DOCUMENT_ORDER) {
      const source = readFileSync(
        join(
          __dirname,
          `assets/${type.toLowerCase().replaceAll("_", "-")}.docx`,
        ),
      );
      const report = validateDocxTemplate(source, type);
      const asset = await prisma.mediaAsset.create({
        data: {
          provider: "test-private-storage",
          bucket: "test-fixtures",
          storageKey: `${prefix}/${type}.docx`,
          contentType: DOCX_MIME,
          byteSize: source.length,
          checksumSha256: digest(source),
          uploadedByUserId: userId,
        },
      });
      sourceAssetId = asset.id;
      const template = await prisma.contractTemplate.create({
        data: {
          companyId,
          type,
          name: `${prefix}-${type}`,
          locale: "ro",
          createdBy: userId,
        },
      });
      versionIds[type] = (
        await prisma.contractTemplateVersion.create({
          data: {
            templateId: template.id,
            version: 1,
            status: "PUBLISHED",
            sourceAssetId: asset.id,
            sourceSha256: report.sourceSha256,
            schemaVersion: REGISTRY_VERSION,
            rendererVersion: RENDERER_VERSION,
            manifestHash: report.manifestHash,
            validationStatus: "PASSED",
            createdBy: userId,
            approvedBy: userId,
            approvedAt: new Date(),
            publishedAt: new Date(),
            reviewStatement: "Synthetic database fixture; not legal approval",
          },
        })
      ).id;
    }
    const input = {
      name: prefix,
      locale: "ro" as const,
      agreementVersionId: versionIds.RENTAL_AGREEMENT,
      gdprVersionId: versionIds.GDPR_NOTICE,
      technicalVersionId: versionIds.TECHNICAL_HANDOVER,
      promotionApproved: false,
    };
    const sets = await Promise.all([
      templates.createSet(userId, input),
      templates.createSet(userId, input),
    ]);
    setIds = sets.map((set) => (set as { id: string }).id);
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    try {
      if (companyId) {
        await prisma.rentalSigningSession.deleteMany({
          where: { package: { companyId } },
        });
        await prisma.signingInvitation.deleteMany({
          where: { package: { companyId } },
        });
        await prisma.contractDelivery.deleteMany({
          where: { package: { companyId } },
        });
        await prisma.documentPackage.deleteMany({ where: { companyId } });
        await prisma.contractSettings.deleteMany({ where: { companyId } });
        await prisma.templateSetVersion.deleteMany({ where: { companyId } });
        await prisma.contractTemplateVersion.deleteMany({
          where: { template: { companyId } },
        });
        await prisma.contractTemplate.deleteMany({ where: { companyId } });
      }
      await prisma.contractCommand.deleteMany({
        where: { key: { in: commandKeys } },
      });
      if (rentalIds.length) {
        await prisma.scooterPhoto.deleteMany({
          where: { rentalId: { in: rentalIds } },
        });
        await prisma.rentalPayment.deleteMany({
          where: { rentalId: { in: rentalIds } },
        });
        await prisma.rentalInspection.deleteMany({
          where: { rentalId: { in: rentalIds } },
        });
        await prisma.rentalParticipant.deleteMany({
          where: { rentalId: { in: rentalIds } },
        });
        await prisma.rental.deleteMany({ where: { id: { in: rentalIds } } });
      }
      if (scooterIds.length) {
        await prisma.scooterProblem.deleteMany({
          where: { scooterId: { in: scooterIds } },
        });
        await prisma.scooter.deleteMany({ where: { id: { in: scooterIds } } });
      }
      if (brandId) await prisma.scooterBrand.delete({ where: { id: brandId } });
      if (personId)
        await prisma.personDocumentPhoto.deleteMany({
          where: { personDocument: { personId } },
        });
      if (userId) {
        await prisma.mediaAsset.deleteMany({
          where: { uploadedByUserId: userId },
        });
        await prisma.auditEvent.deleteMany({ where: { userId } });
      }
      if (personId) {
        await prisma.personDocument.deleteMany({ where: { personId } });
        await prisma.person.delete({ where: { id: personId } });
      }
      if (userId) await prisma.user.delete({ where: { id: userId } });
      if (companyId)
        await prisma.financeLegalIdentity.delete({ where: { id: companyId } });
      if (bookId) await prisma.financeBook.delete({ where: { id: bookId } });
    } finally {
      await prisma.$disconnect();
    }
  }, 30_000);

  async function newRental(workflowVersion = 1) {
    const scooter = await prisma.scooter.create({
      data: {
        fleetNumber: Math.floor(Math.random() * 1_000_000_000) + 100_000_000,
        vin: randomUUID().replaceAll("-", "").slice(0, 17),
        brandId,
        powertrainType: "electric",
        commercialCategory: "without_license",
        limiterKind: "NO_LIMITER",
        maxSpeedKmh: 45,
        maxSpeedSource: "Synthetic CIV fixture",
        configurationEvidence: "Synthetic test record",
        currentMileageKm: 100,
        hasPhoneStand: false,
        hasChargingOutlet: false,
      },
    });
    scooterIds.push(scooter.id);
    const anchor = new Date("2026-10-20T09:00:00Z");
    const rental = await prisma.rental.create({
      data: {
        scooterId: scooter.id,
        personId,
        createdByUserId: userId,
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt: new Date(Date.now() + 30 * 86_400_000),
        workflowVersion,
        termsSnapshot: v1.rentals.calculateRentalTerms("without_license"),
        billingAnchorAt: anchor,
        agreementStartsAt: anchor,
        agreementEndsAt: new Date("2028-10-20T09:00:00Z"),
        nextPaymentDueAt: v1.rentals.addRentalCalendar(anchor, 7),
      },
    });
    rentalIds.push(rental.id);
    return { scooter, rental };
  }

  it("serializes concurrent set creation into unique consecutive versions", async () => {
    const sets = await prisma.templateSetVersion.findMany({
      where: { companyId },
      orderBy: { version: "asc" },
    });
    expect(sets.map((set) => set.version)).toEqual([1, 2]);
  });

  it("atomically activates one set when administrators race on the same expected pointer", async () => {
    const keys = [randomUUID(), randomUUID()];
    commandKeys.push(...keys);
    const results = await Promise.allSettled(
      setIds.map((id, index) =>
        templates.activate(userId, id, {
          idempotencyKey: keys[index],
          expectedActiveSetId: null,
          reason: "Synthetic atomic activation test",
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(setIds).toContain(
      (
        await prisma.contractSettings.findUniqueOrThrow({
          where: { companyId },
        })
      ).activeSetId,
    );
  });

  it("coalesces concurrent idempotency keys into one committed side effect", async () => {
    const key = randomUUID();
    commandKeys.push(key);
    const before = await prisma.contractSettings.findUniqueOrThrow({
      where: { companyId },
    });
    let executions = 0;
    const run = () =>
      prisma.$transaction((tx) =>
        support.command(
          tx,
          key,
          "test.atomic",
          companyId,
          { amount: 30000 },
          async () => {
            executions++;
            await tx.contractSettings.update({
              where: { companyId },
              data: { revision: { increment: 1 } },
            });
            return companyId;
          },
        ),
      );
    expect(await Promise.all([run(), run()])).toEqual([companyId, companyId]);
    expect(executions).toBe(1);
    expect(
      (
        await prisma.contractSettings.findUniqueOrThrow({
          where: { companyId },
        })
      ).revision,
    ).toBe(before.revision + 1);
    await expect(
      prisma.$transaction((tx) =>
        support.command(tx, key, "test.atomic", companyId, { amount: 1 }, () =>
          Promise.resolve(companyId),
        ),
      ),
    ).rejects.toThrow("different operation");
  });

  it("protects referenced source assets and versions against deletion", async () => {
    await expect(
      prisma.mediaAsset.delete({ where: { id: sourceAssetId } }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.contractTemplateVersion.delete({
        where: { id: versionIds.GDPR_NOTICE },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    expect(
      await prisma.mediaAsset.findUnique({ where: { id: sourceAssetId } }),
    ).not.toBeNull();
  });

  it("pins existing packages when activating another set and invalidates changed identity sources", async () => {
    const { rental } = await newRental();
    const current = await prisma.contractSettings.findUniqueOrThrow({
      where: { companyId },
    });
    const pinnedSet = current.activeSetId!;
    const fingerprint = await prisma.$transaction((tx) =>
      packageSourceFingerprint(tx, rental.id, identityId),
    );
    const pkg = await prisma.documentPackage.create({
      data: {
        companyId,
        rentalId: rental.id,
        revision: 1,
        rentalRevision: rental.revision,
        templateSetVersionId: pinnedSet,
        snapshot: { fixture: true },
        subjectHash: "test-only",
        sourceFingerprint: fingerprint,
        identityDocumentId: identityId,
        createdBy: userId,
      },
    });
    const key = randomUUID();
    commandKeys.push(key);
    const otherSet = setIds.find((id) => id !== pinnedSet)!;
    await templates.activate(userId, otherSet, {
      idempotencyKey: key,
      expectedActiveSetId: pinnedSet,
      reason: "Synthetic explicit rollback test",
    });
    expect(
      (
        await prisma.documentPackage.findUniqueOrThrow({
          where: { id: pkg.id },
        })
      ).templateSetVersionId,
    ).toBe(pinnedSet);
    await prisma.$transaction((tx) => assertPackageCurrent(tx, pkg));
    await prisma.personDocument.update({
      where: { id: identityId },
      data: {
        number: "CHANGED-TESTONLY",
        updatedAt: new Date(Date.now() + 1000),
      },
    });
    await expect(
      prisma.$transaction((tx) => assertPackageCurrent(tx, pkg)),
    ).rejects.toThrow("revision");
  });

  it("invalidates a package when identity photo bytes/references change without touching the parent", async () => {
    const { rental } = await newRental();
    const before = await prisma.personDocument.findUniqueOrThrow({
      where: { id: identityId },
    });
    const fingerprint = await prisma.$transaction((tx) =>
      packageSourceFingerprint(tx, rental.id, identityId),
    );
    const pkg = {
      rentalId: rental.id,
      rentalRevision: rental.revision,
      sourceFingerprint: fingerprint,
      identityDocumentId: identityId,
    };
    const asset = await prisma.mediaAsset.create({
      data: {
        provider: "test-private-storage",
        bucket: "test-fixtures",
        storageKey: `${prefix}/identity-${randomUUID()}.png`,
        contentType: "image/png",
        byteSize: 1,
        checksumSha256: digest("test-only"),
        uploadedByUserId: userId,
      },
    });
    await prisma.personDocumentPhoto.create({
      data: { personDocumentId: identityId, assetId: asset.id, slot: "front" },
    });
    expect(
      (
        await prisma.personDocument.findUniqueOrThrow({
          where: { id: identityId },
        })
      ).updatedAt,
    ).toEqual(before.updatedAt);
    await expect(
      prisma.$transaction((tx) => assertPackageCurrent(tx, pkg)),
    ).rejects.toThrow("revision");
  });

  it("protects the exact vehicle client copy referenced by a package snapshot", async () => {
    const { scooter, rental } = await newRental();
    const createAsset = (suffix: string) =>
      prisma.mediaAsset.create({
        data: {
          provider: "test-private-storage",
          bucket: "test-fixtures",
          storageKey: `${prefix}/vehicle-${randomUUID()}-${suffix}.pdf`,
          contentType: "application/pdf",
          byteSize: 1,
          checksumSha256: digest("test-only"),
          uploadedByUserId: userId,
        },
      });
    const original = await createAsset("original"),
      copy = await createAsset("copy");
    const document = await prisma.scooterDocument.create({
      data: {
        scooterId: scooter.id,
        assetId: original.id,
        clientCopyAssetId: copy.id,
        type: "registration_certificate",
        customerVisible: true,
        fileName: "original.pdf",
        clientCopyFileName: "authorized.pdf",
      },
    });
    await prisma.documentPackage.create({
      data: {
        companyId,
        rentalId: rental.id,
        revision: 1,
        rentalRevision: rental.revision,
        templateSetVersionId: setIds[0],
        snapshot: {
          vehicleDocuments: [
            {
              documentId: document.id,
              type: document.type,
              assetId: copy.id,
              sha256: copy.checksumSha256,
              contentType: copy.contentType,
              fileName: "authorized.pdf",
            },
          ],
        },
        subjectHash: "test-only",
        sourceFingerprint: "test-only",
        createdBy: userId,
      },
    });
    await expect(
      prisma.$transaction((tx) =>
        assertVehicleDocumentsMutable(tx, scooter.id, [document.id]),
      ),
    ).rejects.toThrow("retained contract package");
    await expect(
      prisma.mediaAsset.delete({ where: { id: copy.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("stores private rental media with real metadata transactions and rejects cross-rental access", async () => {
    const { scooter, rental } = await newRental();
    const objects = new Map<string, Buffer>();
    const storage = {
      storeImage: ({ buffer }: { buffer: Buffer }) => {
        const key = `${prefix}/media-${randomUUID()}.png`;
        objects.set(key, buffer);
        return Promise.resolve({
          provider: "s3",
          bucket: "test-fixtures",
          storageKey: key,
          contentType: "image/png",
          byteSize: buffer.length,
          checksumSha256: digest(buffer),
        });
      },
      readImage: (key: string) =>
        Promise.resolve({
          body: Readable.from([objects.get(key)!]),
          contentType: "image/png",
          contentLength: objects.get(key)!.length,
        }),
      deleteImage: (key: string) => {
        objects.delete(key);
        return Promise.resolve();
      },
    } as unknown as ImageStorageService;
    const media = new RentalMediaService(
      prisma as unknown as PrismaService,
      access,
      storage,
      support.audit,
    );
    const buffer = createCanvas(220, 220).toBuffer("image/png");
    const file = {
      buffer,
      size: buffer.length,
      originalname: "handover.png",
      mimetype: "image/png",
    } as Express.Multer.File;
    const created = await media.upload(userId, rental.id, "handover", file);
    expect(
      (
        await prisma.scooterPhoto.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).type,
    ).toBe("RENTAL_BEFORE");
    expect(
      (
        await prisma.scooterPhoto.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).isPublic,
    ).toBe(false);
    expect(
      (await media.list(userId, rental.id, "handover")).items.map(
        (item) => item.id,
      ),
    ).toEqual([created.id]);
    expect(
      (await media.content(userId, rental.id, created.id)).buffer.length,
    ).toBeGreaterThan(0);
    const other = await newRental();
    await expect(
      media.content(userId, other.rental.id, created.id),
    ).rejects.toThrow("not found");
    await expect(
      media.upload(userId, rental.id, "return", file),
    ).rejects.toThrow("corresponding handover");
    await prisma.rental.update({
      where: { id: rental.id },
      data: { status: "active" },
    });
    const returned = await media.upload(userId, rental.id, "return", file);
    expect(
      (
        await prisma.scooterPhoto.findUniqueOrThrow({
          where: { id: returned.id },
        })
      ).type,
    ).toBe("RENTAL_AFTER");
    expect(
      (await prisma.scooter.findUniqueOrThrow({ where: { id: scooter.id } }))
        .currentMileageKm,
    ).toBe(100);
  });

  it("rejects a stale inspection rather than overwriting a mechanic's update", async () => {
    const { scooter, rental } = await newRental();
    await prisma.scooter.update({
      where: { id: scooter.id },
      data: {
        speedometerWorking: false,
        updatedAt: new Date(scooter.updatedAt.getTime() + 1000),
      },
    });
    await expect(
      rentals.saveInspection(
        userId,
        rental.id,
        {
          revision: rental.revision,
          expectedScooterUpdatedAt: scooter.updatedAt.toISOString(),
          eventType: "handover",
          data: prefillRentalInspection(scooter),
        },
        true,
      ),
    ).rejects.toThrow("changed");
    expect(
      await prisma.rentalInspection.count({ where: { rentalId: rental.id } }),
    ).toBe(0);
    expect(
      (await prisma.scooter.findUniqueOrThrow({ where: { id: scooter.id } }))
        .speedometerWorking,
    ).toBe(false);
  });

  it("serializes two simultaneous inspection confirmations using optimistic revisions", async () => {
    const { scooter, rental } = await newRental();
    const input = {
      revision: rental.revision,
      expectedScooterUpdatedAt: scooter.updatedAt.toISOString(),
      eventType: "handover" as const,
      data: prefillRentalInspection(scooter),
    };
    const results = await Promise.allSettled([
      rentals.saveInspection(userId, rental.id, input, true),
      rentals.saveInspection(userId, rental.id, input, true),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await prisma.rentalInspection.count({ where: { rentalId: rental.id } }),
    ).toBe(1);
  });

  it("saves critical findings and a hold without inventing broken-odometer mileage", async () => {
    const { scooter, rental } = await newRental();
    const data = {
      ...prefillRentalInspection(scooter),
      brakes: "defect" as const,
      odometer: "defect" as const,
      odometerDisplayedKm: 123,
      criticalDefect: "Synthetic brake defect",
    };
    const result = await rentals.saveInspection(
      userId,
      rental.id,
      {
        revision: rental.revision,
        expectedScooterUpdatedAt: scooter.updatedAt.toISOString(),
        eventType: "handover",
        data,
      },
      true,
    );
    expect(result.inspection.status).toBe("confirmed");
    expect(
      (await prisma.scooter.findUniqueOrThrow({ where: { id: scooter.id } }))
        .currentMileageKm,
    ).toBe(100);
    expect(
      await prisma.scooterProblem.count({
        where: { scooterId: scooter.id, blocksUsage: true, status: "open" },
      }),
    ).toBe(1);
    await expect(
      rentals.transition(userId, rental.id, result.revision, "handover"),
    ).rejects.toThrow();
    expect(
      (await prisma.rental.findUniqueOrThrow({ where: { id: rental.id } }))
        .status,
    ).toBe("reserved");
  });

  it("allocates late receipts to the original Bucharest period, deduplicates retries and collects the deposit once", async () => {
    const { rental } = await newRental();
    const key = randomUUID();
    const receipt = {
      idempotencyKey: key,
      purpose: "rent" as const,
      method: "cash" as const,
      amountMinor: 30000,
      receivedAt: new Date().toISOString(),
      evidenceReference: "Synthetic receipt TEST",
    };
    await expect(
      rentals.confirmPayment(userId, rental.id, {
        ...receipt,
        idempotencyKey: randomUUID(),
        amountMinor: 1,
      }),
    ).rejects.toThrow("server-calculated obligation");
    const results = await Promise.all([
      rentals.confirmPayment(userId, rental.id, receipt),
      rentals.confirmPayment(userId, rental.id, receipt),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(results[0].coverageStartsAt).toEqual(rental.billingAnchorAt);
    expect(results[0].coverageEndsAt?.toISOString()).toBe(
      "2026-10-27T10:00:00.000Z",
    );
    const updated = await prisma.rental.findUniqueOrThrow({
      where: { id: rental.id },
    });
    expect(updated.billingAnchorAt).toEqual(rental.billingAnchorAt);
    expect(updated.nextPaymentDueAt).toEqual(results[0].coverageEndsAt);
    await expect(
      rentals.confirmPayment(userId, rental.id, {
        ...receipt,
        idempotencyKey: randomUUID(),
        amountMinor: 1,
      }),
    ).rejects.toThrow();
    await rentals.confirmPayment(userId, rental.id, {
      ...receipt,
      idempotencyKey: randomUUID(),
      purpose: "deposit",
    });
    await expect(
      rentals.confirmPayment(userId, rental.id, {
        ...receipt,
        idempotencyKey: randomUUID(),
        purpose: "deposit",
      }),
    ).rejects.toThrow("already confirmed");
    expect(
      await prisma.rentalPayment.count({ where: { rentalId: rental.id } }),
    ).toBe(2);
  });

  it("blocks the legacy handover route when the new checkout has no signed package", async () => {
    const { rental } = await newRental();
    // Vehicle document validation is an explicit adapter stub here; all checkout DB checks remain real.
    const vehicleDocuments = jest
      .spyOn(
        rentals as unknown as { assertDocuments: () => Promise<void> },
        "assertDocuments",
      )
      .mockResolvedValue(undefined);
    try {
      await expect(
        rentals.transition(userId, rental.id, rental.revision, "handover"),
      ).rejects.toThrow("Complete the rental checkout");
      expect(
        (await prisma.rental.findUniqueOrThrow({ where: { id: rental.id } }))
          .status,
      ).toBe("reserved");
    } finally {
      vehicleDocuments.mockRestore();
    }
  });
});
